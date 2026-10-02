import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { forwardRef, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { VoteChoice, VotingMethod } from '../prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { VotingService } from '../voting/voting.service';
import { QuorumService } from '../meetings/quorum.service';
import { parseCorsWhitelist } from '../common/cors-origin';
import { DirectoryService } from '../directory/directory.service';
import { DirectorySyncService } from '../directory/directory-sync.service';
import { isDistrictAdmin, Role } from '../auth/role';
import { MeetingsTokenPayload } from '../auth/meetings-token';

const MEETING_ROOM_PREFIX = 'meeting:';

interface SocketWithData {
  id: string;
  join: (r: string) => void;
  leave: (r: string) => void;
  handshake?: { auth?: { token?: string }; query?: { token?: string } };
  data?: { userId?: string; meetingIds?: string[] };
  rooms?: Set<string> | string[];
}

@WebSocketGateway({
  cors: {
    origin: (origin: string, callback: (err: Error | null, allow?: boolean) => void) => {
      const whitelist = parseCorsWhitelist(process.env.MEETINGS_CORS_ORIGIN);
      if (whitelist.length === 0 || !origin || whitelist.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  // In-memory tracking: meetingId -> Map<clubId, Set<socketId>>
  private connectedClubs = new Map<string, Map<string, Set<string>>>();
  // In-memory tracking: meetingId -> Map<userId, Set<socketId>>
  private connectedUsers = new Map<string, Map<string, Set<string>>>();
  // Debounce timeouts per meetingId
  private broadcastDebounces = new Map<string, NodeJS.Timeout>();
  // Cached list of enabled clubs for district meetings
  private enabledClubsCache: { id: string; name: string }[] | null = null;
  private enabledClubsLastFetched = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly audit: AuditService,
    @Inject(forwardRef(() => VotingService))
    private readonly votingService: VotingService,
    @Inject(forwardRef(() => QuorumService))
    private readonly quorumService: QuorumService,
    private readonly directory: DirectoryService,
    directorySync: DirectorySyncService,
  ) {
    // Club names / standing may change on every directory sync or
    // "Habilitación de clubes" edit: drop the 5-minute enabled-clubs cache.
    directorySync.registerChangeListener(() => {
      this.enabledClubsCache = null;
    });
  }

  /**
   * Every socket must carry a valid meetings token (`auth.token`, or
   * `query.token` like legacy). Rejected connections get a `connect_error`
   * with message "unauthorized", which tells meetings-web to refresh it.
   */
  afterInit(server: Server) {
    server.use((socket: Socket, next) => {
      const payload = this.verifyToken(socket as unknown as SocketWithData);
      if (!payload) return next(new Error('unauthorized'));
      next();
    });
  }

  /** Get count of clubs with at least 1 connected socket */
  getConnectedClubCount(meetingId: string): number {
    const clubs = this.connectedClubs.get(meetingId);
    if (!clubs) return 0;
    let count = 0;
    for (const sockets of clubs.values()) {
      if (sockets.size > 0) count++;
    }
    return count;
  }

  /** Get IDs of clubs currently connected */
  getConnectedClubIds(meetingId: string): string[] {
    const clubs = this.connectedClubs.get(meetingId);
    if (!clubs) return [];
    const ids: string[] = [];
    for (const [clubId, sockets] of clubs.entries()) {
      if (sockets.size > 0) ids.push(clubId);
    }
    return ids;
  }

  private trackClubConnect(meetingId: string, clubId: string, socketId: string) {
    if (!this.connectedClubs.has(meetingId)) {
      this.connectedClubs.set(meetingId, new Map());
    }
    const clubs = this.connectedClubs.get(meetingId)!;
    if (!clubs.has(clubId)) clubs.set(clubId, new Set());
    clubs.get(clubId)!.add(socketId);
  }

  private trackClubDisconnect(meetingId: string, socketId: string) {
    const clubs = this.connectedClubs.get(meetingId);
    if (!clubs) return;
    for (const sockets of clubs.values()) {
      sockets.delete(socketId);
    }
  }

  private trackUserConnect(meetingId: string, userId: string, socketId: string) {
    if (!this.connectedUsers.has(meetingId)) {
      this.connectedUsers.set(meetingId, new Map());
    }
    const users = this.connectedUsers.get(meetingId)!;
    if (!users.has(userId)) users.set(userId, new Set());
    users.get(userId)!.add(socketId);
  }

  private trackUserDisconnect(meetingId: string, userId: string, socketId: string): boolean {
    const users = this.connectedUsers.get(meetingId);
    if (!users) return true;
    const userSockets = users.get(userId);
    if (!userSockets) return true;
    userSockets.delete(socketId);
    if (userSockets.size === 0) {
      users.delete(userId);
      return true; // Last tab/socket closed
    }
    return false; // Still active on other tabs
  }

  handleConnection() {}

  async handleDisconnect(client: SocketWithData) {
    const meetingIds = client.data?.meetingIds ?? [];
    const userId = client.data?.userId;
    for (const meetingId of meetingIds) {
      this.trackClubDisconnect(meetingId, client.id);
      if (userId) {
        const lastTabClosed = this.trackUserDisconnect(meetingId, userId, client.id);
        if (lastTabClosed) {
          await this.markParticipantLeft(meetingId, userId);
        }
      }
    }
    client.data = {};
  }

  private verifyToken(client: SocketWithData): MeetingsTokenPayload | null {
    const token =
      client.handshake?.auth?.token ||
      (typeof client.handshake?.query?.token === 'string' ? client.handshake.query.token : null);
    if (!token) return null;
    try {
      // HS256, aud "meetings-api", iss "meetings-web" (JwtModule verifyOptions)
      const payload = this.jwtService.verify<MeetingsTokenPayload>(token);
      return payload?.sub ? payload : null;
    } catch {
      return null;
    }
  }

  private getUserIdFromClient(client: SocketWithData): string | null {
    return this.verifyToken(client)?.sub ?? null;
  }

  @SubscribeMessage('join_meeting')
  async handleJoinMeeting(client: SocketWithData, payload: { meetingId: string; userId?: string }) {
    return this.doJoinMeeting(client, payload);
  }

  @SubscribeMessage('meeting.join')
  async handleMeetingJoin(client: SocketWithData, payload: { meetingId: string; userId?: string }) {
    return this.doJoinMeeting(client, payload);
  }

  @SubscribeMessage('meeting.toggleTranscription')
  async handleToggleTranscription(
    client: SocketWithData,
    payload: { meetingId: string; enabled: boolean },
  ) {
    const userId = client.data?.userId || this.getUserIdFromClient(client);
    if (!userId) {
      return { event: 'error', data: { message: 'No autenticado' } };
    }
    const role = await this.directory.getRole(userId);
    if (!isDistrictAdmin(role)) {
      return { event: 'error', data: { message: 'No autorizado. Solo el secretario distrital puede habilitar/deshabilitar la transcripción.' } };
    }

    const { meetingId, enabled } = payload;
    await this.prisma.meeting.update({
      where: { id: meetingId },
      data: { transcriptionEnabled: enabled },
    });

    await this.broadcastSnapshot(meetingId);
    return { event: 'meeting.transcriptionToggled', data: { enabled } };
  }

  private async doJoinMeeting(
    client: SocketWithData,
    payload: { meetingId: string; userId?: string },
  ) {
    const { meetingId } = payload;
    if (!meetingId) {
      return { event: 'error', data: { message: 'meetingId required' } };
    }
    const tokenPayload = this.verifyToken(client);
    const userId = tokenPayload?.sub ?? null;
    if (!userId) {
      return { event: 'error', data: { message: 'Token requerido o inválido' } };
    }
    // Unknown person: on-demand directory sync (falls back to the token claims).
    const known = await this.directory.ensurePerson(userId, { name: tokenPayload?.name, email: tokenPayload?.email });
    if (!known) {
      return { event: 'error', data: { message: 'Token requerido o inválido' } };
    }
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
      select: { id: true, isDistrictMeeting: true, attendanceLocked: true, scheduledAt: true },
    });
    if (!meeting) {
      return { event: 'error', data: { message: 'Reunión no encontrada' } };
    }
    // Role from the directory (legacy read User.role, where PRESIDENT never appears).
    const dbRole = await this.directory.getRole(userId);
    const user: { role: Role } = { role: dbRole === Role.PRESIDENT ? Role.PARTICIPANT : dbRole };
    const isDistrictAdmin = user.role === 'SECRETARY' || user.role === 'RDR' || user.role === 'SUPERADMIN';

    let targetClubId: string | null = null;
    let isDelegate = false;

    if (meeting.isDistrictMeeting) {
      // Check if user is already a registered participant in the meeting
      const existingParticipant = await this.prisma.meetingParticipant.findUnique({
        where: { meetingId_userId: { meetingId, userId } },
      });

      if (existingParticipant) {
        isDelegate = existingParticipant.isDelegate;
        targetClubId = existingParticipant.clubId;
      } else {
        // Check if user is delegate
        const delegationAsDelegate = await this.prisma.cartaPoder.findFirst({
          where: { meetingId, delegateUserId: userId, status: 'VERIFIED' },
        });

        // Check user membership / presidency. Legacy looked at the first
        // Membership and its isPresident flag or an ACTIVE/ELECTED ClubPresidency
        // in the meeting/current/next period; the kernel's ACTIVE CLUB_PRESIDENT
        // appointment (DirMembership.isPresident) replaces both.
        const membership = await this.directory.getPrimaryMembership(userId);
        const isPresidentOfClub = membership?.isPresident ?? false;
        const userClubId = membership?.clubId ?? null;

        const delegationForClub = userClubId
          ? await this.prisma.cartaPoder.findFirst({
              where: { meetingId, clubId: userClubId, status: 'VERIFIED' },
            })
          : null;

        if (delegationAsDelegate) {
          isDelegate = true;
          targetClubId = delegationAsDelegate.clubId;
        } else if (isPresidentOfClub && !delegationForClub) {
          isDelegate = false;
          targetClubId = userClubId;
        } else if (isPresidentOfClub && delegationForClub) {
          if (!isDistrictAdmin) {
            return { event: 'error', data: { message: 'El acceso ha sido delegado para este club' } };
          }
          // District admin whose club delegated: join as moderator, use their own club
          targetClubId = userClubId;
        } else {
          if (!isDistrictAdmin) {
            return { event: 'error', data: { message: 'Solo el presidente o el delegado verificado pueden ingresar' } };
          }
          // District admin (SECRETARY / RDR / SUPERADMIN) without isPresident flag:
          // resolve their club from membership so they register attendance for their club.
          // If they have no club membership at all, they join as a moderator-only observer.
          targetClubId = userClubId;
        }
      }
    } else {
      const isParticipant = await this.prisma.meetingParticipant.findFirst({
        where: { meetingId, userId },
      });
      const isModerator = user?.role === 'SECRETARY' || user?.role === 'PRESIDENT' || user?.role === 'RDR' || user?.role === 'SUPERADMIN';
      if (!isParticipant && !isModerator) {
        return { event: 'error', data: { message: 'No tenés acceso a esta reunión' } };
      }
    }

    client.data = client.data ?? {};
    client.data.userId = userId;
    if (!Array.isArray(client.data.meetingIds)) client.data.meetingIds = [];
    if (!client.data.meetingIds.includes(meetingId)) client.data.meetingIds.push(meetingId);
    client.join(MEETING_ROOM_PREFIX + meetingId);

    let participant = await this.prisma.meetingParticipant.findUnique({
      where: { meetingId_userId: { meetingId, userId } },
    });

    // ¿El secretario designó explícitamente a este usuario como representante de un club?
    const designation = await this.prisma.clubMeetingAttendance.findFirst({
      where: { meetingId, attendeeUserId: userId },
      select: { clubId: true },
    });

    // Los moderadores (secretario/RDR/superadmin) entran como observadores —no representan
    // club, no votan, no cuentan para el quórum— SALVO que el secretario los haya designado
    // explícitamente como representante de un club (updateClubRepresentative).
    const joinAsObserver = isDistrictAdmin && !designation;
    if (isDistrictAdmin && designation) {
      targetClubId = designation.clubId;
    }

    if (joinAsObserver) {
      // Moderador observador: NO se agrega a la lista de participantes, no registra
      // asistencia y no cuenta para el quórum. Solo se lo trackea como conectado.
      this.trackUserConnect(meetingId, userId, client.id);

      // Si quedó un registro de participante observador (sin club ni voto) creado por
      // una versión anterior, se elimina: los moderadores no van en la lista.
      if (participant && !participant.clubId && !participant.canVote) {
        try {
          await this.prisma.meetingParticipant.delete({ where: { id: participant.id } });
          await this.broadcastSnapshot(meetingId);
        } catch { /* non-blocking */ }
      }
    } else {
      if (!participant && targetClubId) {
        participant = await this.prisma.meetingParticipant.create({
          data: {
            meetingId,
            userId,
            clubId: targetClubId,
            isDelegate: isDelegate,
            canVote: true,
            attendanceStatus: 'JOINED',
            joinedAt: new Date(),
          },
        });
      } else if (participant && targetClubId) {
        participant = await this.prisma.meetingParticipant.update({
          where: { id: participant.id },
          data: {
            clubId: targetClubId,
            isDelegate: isDelegate,
            canVote: true,
          },
        });
      }

      this.trackUserConnect(meetingId, userId, client.id);

      if (participant) {
        let clubId = participant.clubId;

        // Resolve clubId if missing (solo para representantes de club)
        if (!clubId) {
          const membership = await this.directory.getPrimaryMembership(userId);
          clubId = membership?.clubId ?? null;
          await this.prisma.meetingParticipant.update({
            where: { id: participant.id },
            data: { ...(clubId ? { clubId } : {}), attendanceStatus: 'JOINED', ...(participant.joinedAt ? {} : { joinedAt: new Date() }) },
          });
        } else {
          await this.prisma.meetingParticipant.update({
            where: { id: participant.id },
            data: { attendanceStatus: 'JOINED', ...(participant.joinedAt ? {} : { joinedAt: new Date() }) },
          });
        }

        // Track club connection and register attendance
        if (clubId) {
          this.trackClubConnect(meetingId, clubId, client.id);
          if (!meeting.attendanceLocked) {
            try {
              await this.quorumService.recordClubAttendance(meetingId, clubId, userId, participant.isDelegate);
              await this.quorumService.recheckAndUpdateQuorum(meetingId);
            } catch { /* non-blocking */ }
          }
        }

        await this.audit.log({
          meetingId,
          actorUserId: userId,
          action: 'participant.joined',
          entityType: 'MeetingParticipant',
          entityId: participant.id,
        });
        await this.broadcastSnapshot(meetingId);
      }
    }
    const snapshot = await this.buildSnapshot(meetingId, userId);
    return { event: 'meeting.snapshot', data: snapshot };
  }

  private async markParticipantLeft(meetingId: string, userId: string) {
    const participant = await this.prisma.meetingParticipant.findUnique({
      where: { meetingId_userId: { meetingId, userId } },
    });
    if (participant) {
      await this.prisma.meetingParticipant.update({
        where: { id: participant.id },
        data: { attendanceStatus: 'LEFT' },
      });
      await this.audit.log({
        meetingId,
        actorUserId: userId,
        action: 'participant.left',
        entityType: 'MeetingParticipant',
        entityId: participant.id,
      });
      await this.broadcastSnapshot(meetingId);
    }
  }

  @SubscribeMessage('leave_meeting')
  async handleLeaveMeeting(client: SocketWithData, payload: { meetingId: string }) {
    const meetingId = payload.meetingId;
    if (meetingId) {
      this.trackClubDisconnect(meetingId, client.id);
      const userId = client.data?.userId;
      if (userId) {
        const lastTabClosed = this.trackUserDisconnect(meetingId, userId, client.id);
        if (lastTabClosed) {
          await this.markParticipantLeft(meetingId, userId);
        }
      }
      if (Array.isArray(client.data?.meetingIds)) {
        client.data.meetingIds = client.data.meetingIds.filter((id) => id !== meetingId);
      }
    }
    client.leave(MEETING_ROOM_PREFIX + meetingId);
  }

  @SubscribeMessage('vote.submit')
  async handleVoteSubmit(
    client: SocketWithData,
    payload: { meetingId: string; voteSessionId: string; choice: VoteChoice; candidateId?: string },
  ) {
    const userId = client.data?.userId;
    if (!userId) {
      return { event: 'error', data: { message: 'No autenticado' } };
    }
    const { meetingId, voteSessionId, choice, candidateId } = payload;
    if (!meetingId || !voteSessionId) {
      return { event: 'error', data: { message: 'meetingId y voteSessionId requeridos' } };
    }
    const room = MEETING_ROOM_PREFIX + meetingId;
    const inRoom = Array.isArray(client.rooms) ? client.rooms.includes(room) : client.rooms?.has?.(room);
    if (!inRoom) {
      return { event: 'error', data: { message: 'No estás en esta reunión' } };
    }
    try {
      const result = await this.votingService.submitVote(meetingId, voteSessionId, userId, choice, candidateId);
      return { event: 'vote.confirmed', data: result };
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : 'Error al registrar el voto';
      return { event: 'error', data: { message } };
    }
  }

  async emitToMeeting(meetingId: string, event: string, data: unknown) {
    this.server.to(MEETING_ROOM_PREFIX + meetingId).emit(event, data);
  }

  async broadcastSnapshot(meetingId: string) {
    const existingTimeout = this.broadcastDebounces.get(meetingId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const timeout = setTimeout(async () => {
      this.broadcastDebounces.delete(meetingId);
      try {
        const snapshot = await this.buildSnapshot(meetingId);
        await this.emitToMeeting(meetingId, 'meeting.snapshot', snapshot);
      } catch (err: any) {
        const msg = err && err.message ? err.message : String(err);
        console.error(`Error broadcasting snapshot for meeting ${meetingId}: ${msg}`);
      }
    }, 250);

    this.broadcastDebounces.set(meetingId, timeout);
  }

  private async getCachedEnabledClubs() {
    const now = Date.now();
    const cacheTTL = 5 * 60 * 1000; // 5 minutes TTL
    if (!this.enabledClubsCache || now - this.enabledClubsLastFetched > cacheTTL) {
      this.enabledClubsCache = await this.directory.findEnabledClubs();
      this.enabledClubsLastFetched = now;
    }
    return this.enabledClubsCache;
  }

  private async buildSnapshot(meetingId: string, userId?: string) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        topics: { orderBy: { order: 'asc' } },
        voteSessions: {
          where: { status: 'OPEN' },
          include: { topic: true, candidates: { orderBy: { order: 'asc' } } },
        },
        participants: { include: { user: { select: { id: true, fullName: true } } } },
        clubAttendances: { include: { club: { select: { id: true, name: true, status: true } } } },
        speakingRequests: {
          where: { status: { in: ['PENDING', 'ACCEPTED'] } },
          orderBy: { position: 'asc' },
          include: { user: { select: { id: true, fullName: true } } },
        },
      },
    });
    if (!meeting) return null;
    const currentTopic = meeting.currentTopicId
      ? meeting.topics.find((t) => t.id === meeting.currentTopicId)
      : null;
    const openVoteSession = meeting.voteSessions[0];

    // Run all independent queries in parallel
    const [ownVote, voteResult, activeTimers, currentSpeaker, nextSpeaker, votedClubs, motions, enabledClubs] = await Promise.all([
      // Own vote
      userId && openVoteSession
        ? this.prisma.vote.findUnique({
            where: { voteSessionId_userId: { voteSessionId: openVoteSession.id, userId } },
          }).then((v) => v ? { voteSessionId: v.voteSessionId, choice: v.choice, candidateId: v.candidateId } : null)
        : Promise.resolve(null),
      // Vote result
      openVoteSession
        ? this.votingService.getResult(openVoteSession.id).then((res) => {
            if (openVoteSession.votingMethod === VotingMethod.SECRET) {
              return {
                voteSessionId: res.voteSessionId,
                yes: 0,
                no: 0,
                abstain: 0,
                total: res.total,
                approved: null,
                isTied: null,
                requiredMajority: res.requiredMajority,
                ballotType: res.ballotType,
                round: res.round,
                candidateResult: null,
              };
            }
            return res;
          }).catch(() => null)
        : meeting.currentTopicId
          ? this.prisma.voteSession.findFirst({
              where: { meetingId, topicId: meeting.currentTopicId, status: 'CLOSED' },
              orderBy: { closedAt: 'desc' },
              select: { id: true },
            }).then(async (lastClosed) => {
              if (!lastClosed) return null;
              try {
                return await this.votingService.getResult(lastClosed.id);
              } catch (e) {
                return null;
              }
            })
          : Promise.resolve(null),
      // Timers
      this.prisma.timerSession.findMany({
        where: { meetingId, endedAt: null },
        orderBy: { startedAt: 'desc' },
      }),
      // Current speaker
      meeting.currentSpeakerId
        ? this.prisma.dirPerson.findUnique({ where: { id: meeting.currentSpeakerId }, select: { id: true, fullName: true } })
        : Promise.resolve(null),
      // Next speaker
      meeting.nextSpeakerId
        ? this.prisma.dirPerson.findUnique({ where: { id: meeting.nextSpeakerId }, select: { id: true, fullName: true } })
        : Promise.resolve(null),
      // Voted clubs in active session (handles secret votes where clubId is null in Vote table)
      openVoteSession
        ? this.prisma.vote.findMany({
            where: { voteSessionId: openVoteSession.id },
            select: { userId: true },
          }).then(async (votes) => {
            const voterUserIds = votes.map((v) => v.userId);
            const participants = await this.prisma.meetingParticipant.findMany({
              where: {
                meetingId,
                userId: { in: voterUserIds },
              },
              select: { clubId: true },
            });
            return participants.map((p) => ({ clubId: p.clubId }));
          })
        : Promise.resolve([]),
      // Motions
      this.prisma.motion.findMany({
        where: { meetingId },
        orderBy: { createdAt: 'asc' },
        include: {
          proposedByClub: { select: { id: true, name: true } },
          secondedByClub: { select: { id: true, name: true } },
        },
      }),
      // Enabled Clubs
      this.getCachedEnabledClubs(),
    ]);

    const votedClubIds = votedClubs
      .map((vc) => vc.clubId)
      .filter((id): id is string => typeof id === 'string');

    const now = Date.now();
    const timers = activeTimers.map((t) => {
      const elapsed = Math.floor((now - t.startedAt.getTime()) / 1000);
      return {
        id: t.id,
        type: t.type,
        topicId: t.topicId ?? undefined,
        speakingRequestId: t.speakingRequestId ?? undefined,
        plannedDurationSec: t.plannedDurationSec,
        startedAt: t.startedAt.toISOString(),
        pausedAt: t.pausedAt?.toISOString(),
        overtimeSec: t.overtimeSec,
        elapsedSec: elapsed,
      };
    });
    // Quórum autoritativo: present/required/met salen todos de checkQuorum
    // (clubes habilitados; los moderadores no registran asistencia y no cuentan).
    const quorumStatus = meeting.isDistrictMeeting
      ? await this.quorumService.checkQuorum(meetingId)
      : null;

    return {
      meeting: {
        id: meeting.id,
        title: meeting.title,
        status: meeting.status,
        type: meeting.type,
        isDistrictMeeting: meeting.isDistrictMeeting,
        isInformationalOnly: meeting.isInformationalOnly,
        currentTopicId: meeting.currentTopicId,
        currentSpeakerId: meeting.currentSpeakerId,
        nextSpeakerId: meeting.nextSpeakerId,
        attendanceLocked: meeting.attendanceLocked,
        startedAt: meeting.startedAt?.toISOString() ?? null,
        scheduledAt: meeting.scheduledAt?.toISOString() ?? null,
        endedAt: meeting.endedAt?.toISOString() ?? null,
        transcriptionEnabled: meeting.transcriptionEnabled,
      },
      quorum: quorumStatus ? {
        required: quorumStatus.required,
        present: quorumStatus.present,
        met: quorumStatus.met,
        isInformationalOnly: quorumStatus.isInformationalOnly,
        connected: this.getConnectedClubCount(meetingId),
      } : null,
      currentTopic: currentTopic
        ? {
            id: currentTopic.id,
            meetingId: currentTopic.meetingId,
            title: currentTopic.title,
            description: currentTopic.description,
            order: currentTopic.order,
            type: currentTopic.type,
            estimatedDurationSec: currentTopic.estimatedDurationSec,
            status: currentTopic.status,
          }
        : null,
      topics: meeting.topics.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        order: t.order,
        type: t.type,
        estimatedDurationSec: t.estimatedDurationSec,
        status: t.status,
      })),
      activeVote: openVoteSession
        ? {
            voteSessionId: openVoteSession.id,
            topicId: openVoteSession.topicId,
            topicTitle: openVoteSession.topic.title,
            openedAt: openVoteSession.openedAt.toISOString(),
            votingMethod: openVoteSession.votingMethod,
            requiredMajority: openVoteSession.requiredMajority,
            eligibleClubCount: openVoteSession.eligibleClubCount,
            ballotType: openVoteSession.ballotType,
            isElection: openVoteSession.isElection,
            electionType: openVoteSession.electionType,
            round: openVoteSession.round,
            votedClubIds,
            candidates: openVoteSession.candidates.map((c) => ({
              id: c.id,
              displayName: c.displayName,
              userId: c.userId,
            })),
          }
        : null,
      ownVote,
      voteResult,
      timers,
      motions: motions.map((m) => ({
        id: m.id,
        meetingId: m.meetingId,
        title: m.title,
        description: m.description,
        status: m.status,
        proposedByClubId: m.proposedByClubId,
        proposedByClubName: m.proposedByClub.name,
        secondedByClubId: m.secondedByClubId,
        secondedByClubName: m.secondedByClub?.name ?? null,
        voteSessionId: m.voteSessionId,
        createdAt: m.createdAt.toISOString(),
      })),
      speakingQueue: meeting.speakingRequests.map((r) => ({
        id: r.id,
        meetingId: r.meetingId,
        userId: r.userId,
        status: r.status,
        position: r.position,
        requestedAt: r.requestedAt.toISOString(),
        acceptedAt: r.acceptedAt?.toISOString(),
        user: r.user,
      })),
      currentSpeaker: currentSpeaker ? { id: currentSpeaker.id, fullName: currentSpeaker.fullName } : null,
      nextSpeaker: nextSpeaker ? { id: nextSpeaker.id, fullName: nextSpeaker.fullName } : null,
      participants: meeting.participants.map((p) => ({
        userId: p.userId,
        clubId: p.clubId,
        fullName: p.user.fullName,
        attendanceStatus: p.attendanceStatus,
        canVote: p.canVote,
      })),
      clubAttendance: enabledClubs
        .map((club) => {
          const attendance = meeting.clubAttendances.find((a) => a.clubId === club.id);
          const participant = attendance && attendance.attendeeUserId
            ? meeting.participants.find((p) => p.userId === attendance.attendeeUserId)
            : null;

          const isConnected = this.getConnectedClubIds(meetingId).includes(club.id);
          const isPresent = !!attendance;

          let addedAfterLock = false;
          if (meeting.attendanceLocked && meeting.attendanceLockedAt && attendance) {
            addedAfterLock = attendance.createdAt.getTime() > meeting.attendanceLockedAt.getTime();
          }

          // A club is "yellow" if attendance is locked, they are not in the voting base (isPresent is false), but are connected
          const isYellow = meeting.attendanceLocked && !isPresent && isConnected;

          return {
            clubId: club.id,
            clubName: club.name,
            isPresent,
            connected: isConnected,
            attendeeUserId: attendance?.attendeeUserId ?? null,
            attendeeName: participant?.user?.fullName || null,
            addedAfterLock: addedAfterLock || isYellow,
            isYellow,
          };
        })
        .filter((c) => c.isPresent || c.connected),
    };
  }
}
