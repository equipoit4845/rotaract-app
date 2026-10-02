import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MeetingStatus, Role, SpeakingRequestStatus } from '../prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class SpeakingQueueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly audit: AuditService,
  ) {}

  async request(meetingId: string, userId: string) {
    const meeting = await this.prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) throw new NotFoundException('Reunión no encontrada');
    if (meeting.status !== MeetingStatus.LIVE && meeting.status !== MeetingStatus.PAUSED)
      throw new BadRequestException('Solo en reunión en vivo o pausada');
    const existing = await this.prisma.speakingRequest.findFirst({
      where: { meetingId, userId, status: SpeakingRequestStatus.PENDING },
    });
    if (existing) throw new BadRequestException('Ya tenés una solicitud pendiente');
    const maxPos = await this.prisma.speakingRequest
      .aggregate({
        where: { meetingId, status: { in: [SpeakingRequestStatus.PENDING, SpeakingRequestStatus.ACCEPTED] } },
        _max: { position: true },
      })
      .then((r) => r._max.position ?? -1);
    const req = await this.prisma.speakingRequest.create({
      data: { meetingId, userId, position: maxPos + 1 },
      include: { user: true },
    });
    await this.audit.log({
      meetingId,
      actorUserId: userId,
      action: 'speaking.request.created',
      entityType: 'SpeakingRequest',
      entityId: req.id,
    });
    await this.realtime.broadcastSnapshot(meetingId);
    return req;
  }

  async cancel(meetingId: string, requestId: string, userId: string, userRole?: Role) {
    const req = await this.prisma.speakingRequest.findFirst({
      where: { id: requestId, meetingId },
    });
    if (!req) throw new NotFoundException('Solicitud no encontrada');
    const isModerator = userRole === Role.SECRETARY || userRole === Role.RDR || userRole === Role.SUPERADMIN;
    if (req.userId !== userId && !isModerator) throw new BadRequestException('No podés cancelar esta solicitud');
    if (req.status !== SpeakingRequestStatus.PENDING)
      throw new BadRequestException('Solo se puede cancelar una solicitud pendiente');
    await this.prisma.speakingRequest.update({
      where: { id: requestId },
      data: { status: SpeakingRequestStatus.CANCELLED },
    });
    await this.audit.log({
      meetingId,
      actorUserId: userId,
      action: 'speaking.request.updated',
      entityType: 'SpeakingRequest',
      entityId: requestId,
      metadata: { status: 'CANCELLED' },
    });
    await this.realtime.broadcastSnapshot(meetingId);
    return { ok: true };
  }

  async list(meetingId: string) {
    return this.prisma.speakingRequest.findMany({
      where: { meetingId, status: { in: [SpeakingRequestStatus.PENDING, SpeakingRequestStatus.ACCEPTED] } },
      orderBy: { position: 'asc' },
      include: { user: { select: { id: true, fullName: true } } },
    });
  }

  async setCurrentSpeaker(meetingId: string, userId: string | null, actorUserId: string) {
    const meeting = await this.prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) throw new NotFoundException('Reunión no encontrada');
    const updated = await this.prisma.meeting.update({
      where: { id: meetingId },
      data: { currentSpeakerId: userId },
    });
    await this.audit.log({
      meetingId,
      actorUserId,
      action: 'meeting.speaker.changed',
      entityType: 'Meeting',
      entityId: meetingId,
      metadata: { currentSpeakerId: updated.currentSpeakerId, nextSpeakerId: updated.nextSpeakerId },
    });
    await this.realtime.broadcastSnapshot(meetingId);
    return this.getQueueState(meetingId);
  }

  /**
   * Permite al orador actual soltar la palabra por sí mismo.
   * A diferencia de setCurrentSpeaker (solo SECRETARY/RDR), cualquier usuario
   * puede invocarlo, pero solo si es quien tiene la palabra en este momento.
   * No permite asignarse como orador: únicamente liberar el atril.
   */
  async releaseFloor(meetingId: string, userId: string) {
    const meeting = await this.prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) throw new NotFoundException('Reunión no encontrada');
    if (meeting.currentSpeakerId !== userId) {
      throw new BadRequestException('No tenés la palabra actualmente');
    }
    await this.prisma.meeting.update({
      where: { id: meetingId },
      data: { currentSpeakerId: null },
    });
    await this.audit.log({
      meetingId,
      actorUserId: userId,
      action: 'meeting.speaker.released',
      entityType: 'Meeting',
      entityId: meetingId,
      metadata: { previousSpeakerId: userId },
    });
    await this.realtime.broadcastSnapshot(meetingId);
    return { ok: true };
  }

  async setNextSpeaker(meetingId: string, userId: string | null, actorUserId: string) {
    const meeting = await this.prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) throw new NotFoundException('Reunión no encontrada');
    const updated = await this.prisma.meeting.update({
      where: { id: meetingId },
      data: { nextSpeakerId: userId },
    });
    await this.audit.log({
      meetingId,
      actorUserId,
      action: 'meeting.speaker.changed',
      entityType: 'Meeting',
      entityId: meetingId,
      metadata: { currentSpeakerId: updated.currentSpeakerId, nextSpeakerId: updated.nextSpeakerId },
    });
    await this.realtime.broadcastSnapshot(meetingId);
    return this.getQueueState(meetingId);
  }

  async getQueueState(meetingId: string) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        speakingRequests: {
          where: { status: { in: [SpeakingRequestStatus.PENDING, SpeakingRequestStatus.ACCEPTED] } },
          orderBy: { position: 'asc' },
          include: { user: { select: { id: true, fullName: true } } },
        },
      },
    });
    if (!meeting) throw new NotFoundException('Reunión no encontrada');

    // Fetch speakers in parallel
    const speakerIds = [meeting.currentSpeakerId, meeting.nextSpeakerId].filter(Boolean) as string[];
    const speakers =
      speakerIds.length > 0
        ? await this.prisma.dirPerson.findMany({
            where: { id: { in: speakerIds } },
            select: { id: true, fullName: true },
          })
        : [];
    const speakerMap = new Map(speakers.map((s) => [s.id, s]));

    return {
      queue: meeting.speakingRequests,
      currentSpeaker: meeting.currentSpeakerId ? (speakerMap.get(meeting.currentSpeakerId) ?? null) : null,
      nextSpeaker: meeting.nextSpeakerId ? (speakerMap.get(meeting.nextSpeakerId) ?? null) : null,
    };
  }
}
