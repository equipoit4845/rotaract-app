import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BallotType, MajorityType, VoteChoice, VoteSessionStatus, VotingMethod, MotionStatus, Prisma } from '../prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { DirectoryService } from '../directory/directory.service';
import { isDistrictAdmin } from '../auth/role';
import {
  CandidateVoteResult,
  VoteResult,
  computeCandidateResult,
  computeYesNoResult,
  maskSecretResult,
} from './vote-math';

export type { CandidateResult, CandidateVoteResult, VoteResult } from './vote-math';

@Injectable()
export class VotingService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => RealtimeGateway))
    private readonly realtime: RealtimeGateway,
    private readonly audit: AuditService,
    private readonly directory: DirectoryService,
  ) {}

  async openVote(
    meetingId: string,
    topicId: string,
    userId: string,
    options?: {
      votingMethod?: VotingMethod;
      requiredMajority?: MajorityType;
      isElection?: boolean;
      electionType?: string;
      ballotType?: BallotType;
      candidates?: { displayName: string; userId?: string }[];
    },
  ) {
    const meeting = await this.prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) throw new NotFoundException('Reunión no encontrada');
    if (meeting.status !== 'LIVE' && meeting.status !== 'PAUSED')
      throw new BadRequestException('Solo se puede abrir votación en reunión en vivo o pausada');

    if (meeting.isInformationalOnly) {
      throw new BadRequestException('No se pueden realizar votaciones sin quórum (Art. 42). Reunión informativa.');
    }

    const topic = await this.prisma.agendaTopic.findFirst({
      where: { id: topicId, meetingId },
    });
    if (!topic) throw new NotFoundException('Tema no encontrado');
    const existing = await this.prisma.voteSession.findFirst({
      where: { meetingId, topicId, status: VoteSessionStatus.OPEN },
    });
    if (existing) throw new BadRequestException('Ya hay una votación abierta para este tema');

    const ballotType = options?.ballotType ?? BallotType.YES_NO;

    if (ballotType === BallotType.CANDIDATE) {
      if (!options?.candidates?.length) {
        throw new BadRequestException('Se requieren candidatos para una elección de tipo CANDIDATE');
      }
    }

    let eligibleClubIds: string[] = [];
    if (meeting.isDistrictMeeting) {
      const attendances = await this.prisma.clubMeetingAttendance.findMany({
        where: {
          meetingId,
          club: {
            status: 'ACTIVE',
          },
        },
        select: { clubId: true },
      });
      eligibleClubIds = attendances.map((a) => a.clubId);
    }

    const session = await this.prisma.voteSession.create({
      data: {
        meetingId,
        topicId,
        openedById: userId,
        votingMethod: options?.votingMethod ?? VotingMethod.PUBLIC,
        requiredMajority: options?.requiredMajority ?? MajorityType.SIMPLE,
        isElection: options?.isElection ?? (ballotType === BallotType.CANDIDATE),
        electionType: options?.electionType ?? null,
        ballotType,
        eligibleClubIds: eligibleClubIds.length > 0 ? JSON.stringify(eligibleClubIds) : null,
        eligibleClubCount: eligibleClubIds.length > 0 ? eligibleClubIds.length : null,
      },
      include: { topic: true },
    });

    let candidates: { id: string; displayName: string; userId: string | null }[] = [];
    if (ballotType === BallotType.CANDIDATE && options?.candidates?.length) {
      await this.prisma.voteCandidate.createMany({
        data: options.candidates.map((c, i) => ({
          voteSessionId: session.id,
          displayName: c.displayName,
          userId: c.userId ?? null,
          order: i,
        })),
      });
      candidates = await this.prisma.voteCandidate.findMany({
        where: { voteSessionId: session.id },
        orderBy: { order: 'asc' },
        select: { id: true, displayName: true, userId: true },
      });
    }

    await this.audit.log({
      meetingId,
      actorUserId: userId,
      action: 'vote.session.opened',
      entityType: 'VoteSession',
      entityId: session.id,
      metadata: {
        votingMethod: session.votingMethod,
        requiredMajority: session.requiredMajority,
        isElection: session.isElection,
        electionType: session.electionType,
        ballotType: session.ballotType,
        candidateCount: candidates.length,
      },
    });

    await this.realtime.emitToMeeting(meetingId, 'meeting.vote.opened', {
      voteSessionId: session.id,
      topicId: session.topicId,
      topicTitle: session.topic.title,
      votingMethod: session.votingMethod,
      requiredMajority: session.requiredMajority,
      ballotType: session.ballotType,
      electionType: session.electionType,
      round: session.round,
      candidates,
    });
    await this.realtime.broadcastSnapshot(meetingId);
    return session;
  }

  async closeVote(meetingId: string, voteSessionId: string, userId: string) {
    const session = await this.prisma.voteSession.findFirst({
      where: { id: voteSessionId, meetingId },
    });
    if (!session) throw new NotFoundException('Sesión de votación no encontrada');
    if (session.status !== VoteSessionStatus.OPEN)
      throw new BadRequestException('La votación ya está cerrada');



    const updated = await this.prisma.voteSession.update({
      where: { id: voteSessionId },
      data: { status: VoteSessionStatus.CLOSED, closedAt: new Date(), closedById: userId },
      include: { topic: true },
    });

    await this.audit.log({
      meetingId,
      actorUserId: userId,
      action: 'vote.session.closed',
      entityType: 'VoteSession',
      entityId: voteSessionId,
    });

    const result = await this.evaluateResult(voteSessionId);
    let candidateResult: CandidateVoteResult | null = null;
    if (session.ballotType === BallotType.CANDIDATE) {
      candidateResult = await this.evaluateCandidateResult(voteSessionId);
    }

    // Update Motion status if this vote session is linked to a motion
    const motion = await this.prisma.motion.findFirst({
      where: { voteSessionId },
    });
    if (motion) {
      const isApproved = result.ballotType === BallotType.CANDIDATE
        ? !!candidateResult?.winner
        : !!result.approved;
      await this.prisma.motion.update({
        where: { id: motion.id },
        data: {
          status: isApproved ? MotionStatus.APPROVED : MotionStatus.REJECTED,
        },
      });
    }

    await this.realtime.emitToMeeting(meetingId, 'meeting.vote.closed', {
      meetingId,
      voteSessionId,
      topicId: session.topicId,
      ballotType: session.ballotType,
      round: session.round,
      counts: { yes: result.yes, no: result.no, abstain: result.abstain },
      total: result.total,
      approved: result.approved,
      isTied: result.isTied,
      requiredMajority: result.requiredMajority,
      candidateResult,
    });
    await this.realtime.broadcastSnapshot(meetingId);
    return { ...updated, result: { ...result, candidateResult } };
  }

  async submitVote(
    meetingId: string,
    voteSessionId: string,
    userId: string,
    choice: VoteChoice,
    candidateId?: string,
  ) {
    const [session, meeting] = await Promise.all([
      this.prisma.voteSession.findFirst({ where: { id: voteSessionId, meetingId } }),
      this.prisma.meeting.findUnique({ where: { id: meetingId } }),
    ]);
    if (!session) throw new NotFoundException('Sesión de votación no encontrada');
    if (session.status !== VoteSessionStatus.OPEN)
      throw new BadRequestException('La votación no está abierta');
    if (!meeting) throw new NotFoundException('Reunión no encontrada');

    if (meeting.isInformationalOnly) {
      throw new ForbiddenException('No se pueden emitir votos sin quórum (Art. 42).');
    }

    // Art. 49: RDR votes only on tie. Block regular vote submissions.
    if (await this.directory.hasDistrictRole(userId, 'RDR')) {
      throw new ForbiddenException(
        'El RDR no puede votar en votaciones ordinarias, solo en desempates (Art. 49).',
      );
    }

    // For candidate votes, validate candidateId (only if choice is not ABSTAIN)
    if (session.ballotType === BallotType.CANDIDATE && choice !== VoteChoice.ABSTAIN) {
      if (!candidateId) throw new BadRequestException('Debe seleccionar un candidato');
      const candidate = await this.prisma.voteCandidate.findFirst({
        where: { id: candidateId, voteSessionId },
      });
      if (!candidate) throw new BadRequestException('Candidato no válido');
    }

    const participant = await this.prisma.meetingParticipant.findUnique({
      where: { meetingId_userId: { meetingId, userId } },
    });
    if (!participant?.canVote) {
      throw new ForbiddenException('No tenés derecho a votar en esta reunión');
    }

    let clubId: string | null = null;

    if (meeting.isDistrictMeeting) {
      clubId = participant.clubId;

      if (!clubId) {
        const membership = await this.directory.getPrimaryMembership(userId);
        clubId = membership?.clubId ?? null;

        if (clubId) {
          await this.prisma.meetingParticipant.update({
            where: { meetingId_userId: { meetingId, userId } },
            data: { clubId },
          });
        }
      }

      if (!clubId) {
        throw new ForbiddenException('No se puede votar sin club asociado en reunión distrital');
      }

      if (session.eligibleClubIds) {
        const eligible: string[] = JSON.parse(session.eligibleClubIds);
        if (!eligible.includes(clubId)) {
          throw new ForbiddenException('Tu club no estaba presente al momento de abrir la votación');
        }
      }

      // Check for duplicate club vote (by another user)
      const votesInSession = await this.prisma.vote.findMany({
        where: { voteSessionId },
        select: { userId: true },
      });
      const voterUserIds = votesInSession.map((v) => v.userId);
      const existingClubVoter = await this.prisma.meetingParticipant.findFirst({
        where: {
          meetingId,
          clubId,
          userId: { in: voterUserIds },
        },
      });
      if (existingClubVoter && existingClubVoter.userId !== userId) {
        throw new ForbiddenException('Tu club ya emitió un voto en esta votación');
      }
    }

    // For candidate votes, choice is YES for multi-candidate elections, or the actual choice (YES/NO/ABSTAIN) for single-candidate elections.
    let effectiveChoice = choice;
    if (session.ballotType === BallotType.CANDIDATE) {
      const candidateCount = await this.prisma.voteCandidate.count({ where: { voteSessionId } });
      if (candidateCount > 1) {
        effectiveChoice = choice === VoteChoice.ABSTAIN ? VoteChoice.ABSTAIN : VoteChoice.YES;
      }
    }

    // For secret votes, do not record the clubId on the Vote record
    const voteClubId = session.votingMethod === VotingMethod.SECRET ? null : clubId;

    // ballotClubId backs the one-vote-per-club rule with a unique index
    // (deliberate fix, contract §Behaviour 4): the read-then-write check above
    // keeps the legacy message, the index closes the race between two members.
    const ballotClubId = meeting.isDistrictMeeting ? clubId : null;
    let vote;
    try {
      vote = await this.prisma.vote.upsert({
        where: { voteSessionId_userId: { voteSessionId, userId } },
        create: { voteSessionId, userId, clubId: voteClubId, ballotClubId, choice: effectiveChoice, candidateId: candidateId ?? null },
        update: { choice: effectiveChoice, clubId: voteClubId, ballotClubId, candidateId: candidateId ?? null },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const target = JSON.stringify(err.meta?.target ?? '');
        if (target.includes('ballotClubId') || target.includes('ballot_club')) {
          throw new ForbiddenException('Tu club ya emitió un voto en esta votación');
        }
        throw new BadRequestException('Tu voto ya está siendo registrado');
      }
      throw err;
    }

    await this.audit.log({
      meetingId,
      actorUserId: userId,
      action: 'vote.cast',
      entityType: 'Vote',
      entityId: vote.id,
    });

    const result = await this.evaluateResult(voteSessionId);
    let candidateResult: CandidateVoteResult | null = null;
    if (session.ballotType === BallotType.CANDIDATE && session.votingMethod === VotingMethod.PUBLIC) {
      candidateResult = await this.evaluateCandidateResult(voteSessionId);
    }

    const isSecret = session.votingMethod === VotingMethod.SECRET;

    await this.realtime.emitToMeeting(meetingId, 'meeting.vote.result', {
      meetingId,
      voteSessionId,
      topicId: session.topicId,
      ballotType: session.ballotType,
      counts: isSecret ? null : { yes: result.yes, no: result.no, abstain: result.abstain },
      total: result.total,
      approved: isSecret ? null : result.approved,
      isTied: isSecret ? null : result.isTied,
      candidateResult: isSecret ? null : candidateResult,
    });

    if (isSecret) {
      return {
        voteSessionId,
        yes: 0,
        no: 0,
        abstain: 0,
        total: result.total,
        approved: null,
        isTied: null,
        requiredMajority: result.requiredMajority,
        ballotType: result.ballotType,
        round: result.round,
        candidateResult: null,
      };
    }

    return { ...result, candidateResult };
  }

  async submitManualVote(
    meetingId: string,
    voteSessionId: string,
    actorUserId: string,
    clubId: string,
    choice: VoteChoice,
    candidateId?: string,
  ) {
    const session = await this.prisma.voteSession.findFirst({ where: { id: voteSessionId, meetingId } });
    if (!session) throw new NotFoundException('Sesión de votación no encontrada');
    if (session.votingMethod === VotingMethod.SECRET) {
      throw new BadRequestException('No se pueden registrar votos manuales en votaciones secretas');
    }

    const actorRole = await this.directory.getRole(actorUserId);
    if (!isDistrictAdmin(actorRole)) {
      throw new ForbiddenException('Solo los secretarios o el RDR pueden registrar votos manuales');
    }

    const delegation = await this.prisma.cartaPoder.findFirst({
      where: { meetingId, clubId, status: 'VERIFIED' },
      select: { delegateUserId: true },
    });

    let representativeUserId = delegation?.delegateUserId ?? null;
    let isDelegate = !!delegation;

    if (!representativeUserId) {
      // Legacy resolved ClubPresidency (ACTIVE/ELECTED in the meeting/current/next
      // period) and then Membership.isPresident; both are now the ACTIVE
      // CLUB_PRESIDENT appointment synced from the kernel.
      representativeUserId = await this.directory.getPresidentOf(clubId);
    }

    if (!representativeUserId) {
      throw new BadRequestException(
        'No se encontró un presidente ni delegado verificado para este club',
      );
    }

    let participant = await this.prisma.meetingParticipant.findUnique({
      where: { meetingId_userId: { meetingId, userId: representativeUserId } },
    });

    if (!participant) {
      participant = await this.prisma.meetingParticipant.create({
        data: {
          meetingId,
          userId: representativeUserId,
          clubId,
          isDelegate,
          canVote: true,
          attendanceStatus: 'JOINED',
          joinedAt: new Date(),
        },
      });
    } else {
      participant = await this.prisma.meetingParticipant.update({
        where: { id: participant.id },
        data: {
          clubId,
          isDelegate,
          canVote: true,
        },
      });
    }

    const voteResult = await this.submitVote(
      meetingId,
      voteSessionId,
      representativeUserId,
      choice,
      candidateId,
    );

    await this.audit.log({
      meetingId,
      actorUserId,
      action: 'vote.manual_cast',
      entityType: 'Vote',
      metadata: { clubId, representativeUserId },
    });

    await this.realtime.broadcastSnapshot(meetingId);

    return voteResult;
  }

  /**
   * Art. 64i: Open a second round (runoff) between the top 2 candidates from a previous round.
   */
  async openRunoff(meetingId: string, previousSessionId: string, userId: string) {
    const prevSession = await this.prisma.voteSession.findFirst({
      where: { id: previousSessionId, meetingId, status: VoteSessionStatus.CLOSED, ballotType: BallotType.CANDIDATE },
      include: { candidates: true, topic: true },
    });
    if (!prevSession) throw new NotFoundException('Sesión anterior no encontrada o no es de candidatos');

    // Cannot open runoff for sessions already closed with a winner
    const prevResult = await this.evaluateCandidateResult(previousSessionId);
    if (prevResult?.winner) throw new BadRequestException('Ya hubo un ganador en la ronda anterior');
    if (!prevResult?.needsRunoff) throw new BadRequestException('No se requiere segunda vuelta');

    // Find top 2 vote-getters
    const voteCounts = await this.prisma.vote.groupBy({
      by: ['candidateId'],
      where: { voteSessionId: previousSessionId, candidateId: { not: null }, choice: VoteChoice.YES },
      _count: { candidateId: true },
    });
    voteCounts.sort((a, b) => b._count.candidateId - a._count.candidateId);
    const top2Ids = voteCounts.slice(0, 2).map((v) => v.candidateId!);

    if (top2Ids.length < 2) throw new BadRequestException('No hay suficientes candidatos para segunda vuelta');

    const meeting = await this.prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) throw new NotFoundException('Reunión no encontrada');
    if (meeting.isInformationalOnly) throw new BadRequestException('No se puede abrir votación sin quórum');

    let eligibleClubIds: string[] = [];
    if (meeting.isDistrictMeeting) {
      const attendances = await this.prisma.clubMeetingAttendance.findMany({
        where: {
          meetingId,
          club: {
            status: 'ACTIVE',
          },
        },
        select: { clubId: true },
      });
      eligibleClubIds = attendances.map((a) => a.clubId);
    }

    const newSession = await this.prisma.voteSession.create({
      data: {
        meetingId,
        topicId: prevSession.topicId,
        openedById: userId,
        votingMethod: prevSession.votingMethod,
        requiredMajority: prevSession.requiredMajority,
        isElection: true,
        ballotType: BallotType.CANDIDATE,
        round: prevSession.round + 1,
        previousSessionId,
        eligibleClubIds: eligibleClubIds.length > 0 ? JSON.stringify(eligibleClubIds) : null,
        eligibleClubCount: eligibleClubIds.length > 0 ? eligibleClubIds.length : null,
      },
    });

    const top2Candidates = prevSession.candidates.filter((c) => top2Ids.includes(c.id));
    await this.prisma.voteCandidate.createMany({
      data: top2Candidates.map((c, i) => ({
        voteSessionId: newSession.id,
        displayName: c.displayName,
        userId: c.userId,
        order: i,
      })),
    });

    const candidates = await this.prisma.voteCandidate.findMany({
      where: { voteSessionId: newSession.id },
      orderBy: { order: 'asc' },
    });

    await this.audit.log({
      meetingId,
      actorUserId: userId,
      action: 'vote.session.runoff.opened',
      entityType: 'VoteSession',
      entityId: newSession.id,
      metadata: { round: newSession.round, previousSessionId },
    });

    await this.realtime.emitToMeeting(meetingId, 'meeting.vote.opened', {
      voteSessionId: newSession.id,
      topicId: newSession.topicId,
      topicTitle: prevSession.topic.title,
      votingMethod: newSession.votingMethod,
      requiredMajority: newSession.requiredMajority,
      ballotType: newSession.ballotType,
      round: newSession.round,
      candidates: candidates.map((c) => ({ id: c.id, displayName: c.displayName, userId: c.userId })),
    });
    await this.realtime.broadcastSnapshot(meetingId);

    return { ...newSession, candidates };
  }

  /**
   * Art. 49: RDR votes only on tie. For YES_NO votes.
   */
  async submitRdrTiebreaker(meetingId: string, voteSessionId: string, userId: string, choice: VoteChoice) {
    const session = await this.prisma.voteSession.findFirst({
      where: { id: voteSessionId, meetingId, status: VoteSessionStatus.CLOSED },
    });
    if (!session) throw new NotFoundException('Sesión de votación no encontrada o no está cerrada');
    if (session.rdrTiebreakerUsed) {
      throw new BadRequestException('El desempate del RDR ya fue utilizado');
    }
    if (session.ballotType === BallotType.CANDIDATE) {
      throw new BadRequestException('Para elecciones use el desempate por candidato');
    }

    const result = await this.aggregateResult(voteSessionId);
    if (result.yes !== result.no) {
      throw new BadRequestException('No hay empate. El RDR solo vota en caso de empate (Art. 49)');
    }

    await this.prisma.voteSession.update({
      where: { id: voteSessionId },
      data: { rdrTiebreakerUsed: true, rdrTiebreakerChoice: choice },
    });

    await this.audit.log({
      meetingId,
      actorUserId: userId,
      action: 'vote.rdr.tiebreaker',
      entityType: 'VoteSession',
      entityId: voteSessionId,
      metadata: { choice },
    });
    await this.realtime.broadcastSnapshot(meetingId);

    return this.evaluateResult(voteSessionId);
  }

  /**
   * Art. 49 applied to candidate elections: RDR picks the winning candidate when tied.
   */
  async submitRdrCandidateTiebreaker(meetingId: string, voteSessionId: string, userId: string, candidateId: string) {
    const session = await this.prisma.voteSession.findFirst({
      where: { id: voteSessionId, meetingId, status: VoteSessionStatus.CLOSED, ballotType: BallotType.CANDIDATE },
    });
    if (!session) throw new NotFoundException('Sesión no encontrada o no está cerrada');
    if (session.rdrTiebreakerUsed) throw new BadRequestException('El desempate del RDR ya fue utilizado');

    const candResult = await this.evaluateCandidateResult(voteSessionId);
    if (!candResult?.isTied) {
      throw new BadRequestException('No hay empate entre candidatos. El RDR solo interviene en caso de empate (Art. 49)');
    }

    // Validate candidate is one of the tied top candidates
    const tiedIds = candResult.candidateResults
      .filter((c) => c.votes === candResult.candidateResults[0].votes)
      .map((c) => c.candidateId);
    if (!tiedIds.includes(candidateId)) {
      throw new BadRequestException('El candidato seleccionado no está en el empate');
    }

    await this.prisma.voteSession.update({
      where: { id: voteSessionId },
      data: { rdrTiebreakerUsed: true, rdrTiebreakerCandidateId: candidateId },
    });

    await this.audit.log({
      meetingId,
      actorUserId: userId,
      action: 'vote.rdr.candidate.tiebreaker',
      entityType: 'VoteSession',
      entityId: voteSessionId,
      metadata: { candidateId },
    });
    await this.realtime.broadcastSnapshot(meetingId);

    return this.evaluateCandidateResult(voteSessionId);
  }

  async getResult(voteSessionId: string) {
    const session = await this.prisma.voteSession.findUnique({
      where: { id: voteSessionId },
      include: { topic: true },
    });
    if (!session) throw new NotFoundException('Sesión no encontrada');
    const result = await this.evaluateResult(voteSessionId);
    let candidateResult: CandidateVoteResult | null = null;
    if (session.ballotType === BallotType.CANDIDATE) {
      candidateResult = await this.evaluateCandidateResult(voteSessionId);
    }
    return { ...result, candidateResult };
  }

  /**
   * `GET vote/:id/result`. Deliberate fix (contract §Behaviour 2/3): the
   * session must belong to the meeting, and an OPEN SECRET session is masked
   * exactly like the snapshot does.
   */
  async getPublicResult(meetingId: string, voteSessionId: string) {
    const session = await this.prisma.voteSession.findFirst({
      where: { id: voteSessionId, meetingId },
      select: { id: true, status: true, votingMethod: true },
    });
    if (!session) throw new NotFoundException('Sesión no encontrada');
    const res = await this.getResult(voteSessionId);
    if (session.status === VoteSessionStatus.OPEN && session.votingMethod === VotingMethod.SECRET) {
      return maskSecretResult(res);
    }
    return res;
  }

  async getDetailedResult(voteSessionId: string) {
    const session = await this.prisma.voteSession.findUnique({
      where: { id: voteSessionId },
      include: { topic: true, votes: true, candidates: true },
    });
    if (!session) throw new NotFoundException('Sesión no encontrada');

    const aggregate = await this.evaluateResult(voteSessionId);
    let candidateResult: CandidateVoteResult | null = null;
    if (session.ballotType === BallotType.CANDIDATE) {
      candidateResult = await this.evaluateCandidateResult(voteSessionId);
    }

    if (session.votingMethod === VotingMethod.SECRET) {
      return { ...aggregate, candidateResult, votes: [] };
    }

    const votes = await this.prisma.vote.findMany({ where: { voteSessionId } });
    const userIds = [...new Set(votes.map((v) => v.userId))];
    const users = await this.prisma.dirPerson.findMany({
      where: { id: { in: userIds } },
      select: { id: true, fullName: true, email: true },
    });
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
    return {
      ...aggregate,
      candidateResult,
      votes: votes.map((v) => ({
        userId: v.userId,
        clubId: v.clubId,
        choice: v.choice,
        candidateId: v.candidateId,
        user: userMap[v.userId],
      })),
    };
  }

  async getOpenSession(meetingId: string) {
    return this.prisma.voteSession.findFirst({
      where: { meetingId, status: VoteSessionStatus.OPEN },
      include: { topic: true, candidates: { orderBy: { order: 'asc' } } },
    });
  }

  private async evaluateCandidateResult(voteSessionId: string): Promise<CandidateVoteResult | null> {
    const session = await this.prisma.voteSession.findUnique({
      where: { id: voteSessionId },
      include: { candidates: { orderBy: { order: 'asc' } } },
    });
    if (!session) return null;

    const voteCounts = await this.prisma.vote.groupBy({
      by: ['candidateId'],
      where: { voteSessionId, candidateId: { not: null }, choice: VoteChoice.YES },
      _count: { candidateId: true },
    });

    return computeCandidateResult(
      session,
      voteCounts.map((v) => ({ candidateId: v.candidateId, count: v._count.candidateId })),
    );
  }

  private async evaluateResult(voteSessionId: string): Promise<VoteResult> {
    const session = await this.prisma.voteSession.findUnique({
      where: { id: voteSessionId },
    });
    const counts = await this.aggregateResult(voteSessionId);
    return computeYesNoResult(voteSessionId, session, counts);
  }

  private async aggregateResult(voteSessionId: string) {
    const votes = await this.prisma.vote.groupBy({
      by: ['choice'],
      where: { voteSessionId },
      _count: true,
    });
    const map = Object.fromEntries(votes.map((v) => [v.choice, v._count]));
    return {
      voteSessionId,
      yes: map.YES ?? 0,
      no: map.NO ?? 0,
      abstain: map.ABSTAIN ?? 0,
      total: (map.YES ?? 0) + (map.NO ?? 0) + (map.ABSTAIN ?? 0),
    };
  }
}
