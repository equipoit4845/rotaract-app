import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MeetingStatus } from '../prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class TimersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly audit: AuditService,
  ) {}

  async startTopicTimer(meetingId: string, topicId: string, durationSec: number, actorUserId: string) {
    const meeting = await this.prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) throw new NotFoundException('Reunión no encontrada');
    if (meeting.status !== MeetingStatus.LIVE && meeting.status !== MeetingStatus.PAUSED)
      throw new BadRequestException('Solo en reunión en vivo o pausada');
    const topic = await this.prisma.agendaTopic.findFirst({ where: { id: topicId, meetingId } });
    if (!topic) throw new NotFoundException('Tema no encontrado');
    const existing = await this.prisma.timerSession.findFirst({
      where: { meetingId, topicId, endedAt: null },
    });
    if (existing) throw new BadRequestException('Ya hay un timer activo para este tema');
    const timer = await this.prisma.timerSession.create({
      data: { meetingId, topicId, type: 'TOPIC', plannedDurationSec: durationSec },
    });
    await this.audit.log({
      meetingId,
      actorUserId,
      action: 'timer.started',
      entityType: 'TimerSession',
      entityId: timer.id,
    });
    await this.realtime.broadcastSnapshot(meetingId);
    return timer;
  }

  async stopTimer(meetingId: string, timerId: string, actorUserId: string) {
    const timer = await this.prisma.timerSession.findFirst({
      where: { id: timerId, meetingId },
    });
    if (!timer) throw new NotFoundException('Timer no encontrado');
    const endedAt = new Date();
    const elapsed = Math.floor((endedAt.getTime() - timer.startedAt.getTime()) / 1000);
    const overtime = Math.max(0, elapsed - timer.plannedDurationSec);
    await this.prisma.timerSession.update({
      where: { id: timerId },
      data: { endedAt, overtimeSec: overtime },
    });
    await this.audit.log({
      meetingId,
      actorUserId,
      action: 'timer.ended',
      entityType: 'TimerSession',
      entityId: timerId,
      metadata: { overtimeSec: overtime },
    });
    await this.realtime.broadcastSnapshot(meetingId);
    return { ok: true };
  }

  async getActiveTimer(meetingId: string) {
    const timer = await this.prisma.timerSession.findFirst({
      where: { meetingId, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });
    if (!timer) return null;
    const elapsed = Math.floor((Date.now() - timer.startedAt.getTime()) / 1000);
    const remaining = Math.max(0, timer.plannedDurationSec - elapsed);
    const overtime = Math.max(0, elapsed - timer.plannedDurationSec);
    return {
      id: timer.id,
      type: timer.type,
      // Deliberate fix (contract §Behaviour 5): the web needs topicId to show
      // the stop button (the snapshot already carried it).
      topicId: timer.topicId,
      plannedDurationSec: timer.plannedDurationSec,
      startedAt: timer.startedAt.toISOString(),
      remainingSec: remaining,
      overtimeSec: overtime,
    };
  }
}
