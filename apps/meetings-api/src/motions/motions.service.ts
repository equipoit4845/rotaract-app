import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MajorityType, MotionStatus, VotingMethod } from '../prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { VotingService } from '../voting/voting.service';
import { DirectoryService } from '../directory/directory.service';
import { isDistrictAdmin } from '../auth/role';

@Injectable()
export class MotionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly votingService: VotingService,
    private readonly audit: AuditService,
    private readonly directory: DirectoryService,
  ) {}

  async propose(meetingId: string, userId: string, title: string, description?: string) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
    });
    if (!meeting) throw new NotFoundException('Reunión no encontrada');
    if (meeting.status !== 'LIVE' && meeting.status !== 'PAUSED') {
      throw new BadRequestException('Solo se pueden proponer mociones durante una reunión activa');
    }

    // Find user's club representation
    const participant = await this.prisma.meetingParticipant.findUnique({
      where: { meetingId_userId: { meetingId, userId } },
    });

    let clubId = participant?.clubId;

    if (!clubId) {
      const membership = await this.directory.getPrimaryMembership(userId);
      clubId = membership?.clubId;
    }

    if (!clubId) {
      throw new ForbiddenException('Debe pertenecer a un club para proponer una moción');
    }

    const motion = await this.prisma.motion.create({
      data: {
        meetingId,
        title,
        description: description ?? null,
        status: MotionStatus.PROPOSED,
        proposedByUserId: userId,
        proposedByClubId: clubId,
      },
      include: {
        proposedByClub: { select: { id: true, name: true } },
      },
    });

    await this.audit.log({
      meetingId,
      actorUserId: userId,
      action: 'motion.proposed',
      entityType: 'Motion',
      entityId: motion.id,
      metadata: { title, clubId },
    });

    await this.realtime.broadcastSnapshot(meetingId);
    return motion;
  }

  async second(meetingId: string, motionId: string, userId: string) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
    });
    if (!meeting) throw new NotFoundException('Reunión no encontrada');
    if (meeting.status !== 'LIVE' && meeting.status !== 'PAUSED') {
      throw new BadRequestException('Solo se pueden secundar mociones durante una reunión activa');
    }

    const motion = await this.prisma.motion.findUnique({
      where: { id: motionId },
    });
    if (!motion) throw new NotFoundException('Moción no encontrada');
    if (motion.status !== MotionStatus.PROPOSED) {
      throw new BadRequestException('Solo se pueden secundar mociones en estado PROPUESTA');
    }

    // Find user's club representation
    const participant = await this.prisma.meetingParticipant.findUnique({
      where: { meetingId_userId: { meetingId, userId } },
    });

    let clubId = participant?.clubId;

    if (!clubId) {
      const membership = await this.directory.getPrimaryMembership(userId);
      clubId = membership?.clubId;
    }

    if (!clubId) {
      throw new ForbiddenException('Debe pertenecer a un club para secundar una moción');
    }

    if (clubId === motion.proposedByClubId) {
      throw new BadRequestException('Un club no puede secundar su propia moción');
    }

    const updated = await this.prisma.motion.update({
      where: { id: motionId },
      data: {
        status: MotionStatus.SECONDED,
        secondedByUserId: userId,
        secondedByClubId: clubId,
      },
      include: {
        proposedByClub: { select: { id: true, name: true } },
        secondedByClub: { select: { id: true, name: true } },
      },
    });

    await this.audit.log({
      meetingId,
      actorUserId: userId,
      action: 'motion.seconded',
      entityType: 'Motion',
      entityId: motionId,
      metadata: { clubId },
    });

    await this.realtime.broadcastSnapshot(meetingId);
    return updated;
  }

  async launchVote(
    meetingId: string,
    motionId: string,
    actorUserId: string,
    options: {
      votingMethod: VotingMethod;
      requiredMajority: MajorityType;
    },
  ) {
    const actorRole = await this.directory.getRole(actorUserId);
    if (!isDistrictAdmin(actorRole)) {
      throw new ForbiddenException('Solo los secretarios o el RDR pueden lanzar votaciones de moción');
    }

    const motion = await this.prisma.motion.findUnique({
      where: { id: motionId },
    });
    if (!motion) throw new NotFoundException('Moción no encontrada');
    if (motion.status !== MotionStatus.SECONDED) {
      throw new BadRequestException('Solo se pueden votar mociones secundadas');
    }

    const maxOrder = await this.prisma.agendaTopic
      .aggregate({ where: { meetingId }, _max: { order: true } })
      .then((r) => r._max.order ?? -1);

    // Create agenda topic of type VOTING
    const topic = await this.prisma.agendaTopic.create({
      data: {
        meetingId,
        title: `Moción: ${motion.title}`,
        description: motion.description,
        type: 'VOTING',
        order: maxOrder + 1,
        status: 'ACTIVE',
      },
    });

    // Set as current topic of the meeting
    await this.prisma.meeting.update({
      where: { id: meetingId },
      data: { currentTopicId: topic.id },
    });

    // Open vote session
    const voteSession = await this.votingService.openVote(meetingId, topic.id, actorUserId, {
      votingMethod: options.votingMethod,
      requiredMajority: options.requiredMajority,
      ballotType: 'YES_NO',
      isElection: false,
    });

    // Update motion status to VOTING
    const updated = await this.prisma.motion.update({
      where: { id: motionId },
      data: {
        status: MotionStatus.VOTING,
        voteSessionId: voteSession.id,
      },
    });

    await this.audit.log({
      meetingId,
      actorUserId,
      action: 'motion.voting_started',
      entityType: 'Motion',
      entityId: motionId,
      metadata: { topicId: topic.id, voteSessionId: voteSession.id },
    });

    await this.realtime.broadcastSnapshot(meetingId);
    return updated;
  }
}
