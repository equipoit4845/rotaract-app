import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '../prisma/client';
import { Response } from 'express';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuditService } from '../audit/audit.service';
import { MeetingsService } from '../meetings/meetings.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('history')
@UseGuards(AuthGuard('jwt'))
export class HistoryController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly meetingsService: MeetingsService,
    private readonly auditService: AuditService,
  ) {}

  @Get('meetings')
  async listMeetings(@CurrentUser() user: CurrentUserPayload) {
    return this.meetingsService.findAll(user.id, user.role as Role);
  }

  @Get('meetings/:meetingId')
  async getMeeting(@Param('meetingId') meetingId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.meetingsService.findOne(meetingId, user.id, user.role as Role);
  }

  @Get('meetings/:meetingId/votes')
  @UseGuards(RolesGuard)
  @Roles(Role.SECRETARY, Role.PRESIDENT, Role.RDR)
  async getVoteSessions(@Param('meetingId') meetingId: string, @CurrentUser() user: CurrentUserPayload) {
    await this.meetingsService.findOne(meetingId, user.id, user.role as Role);
    const sessions = await this.prisma.voteSession.findMany({
      where: { meetingId },
      include: { topic: { select: { title: true } } },
      orderBy: { openedAt: 'asc' },
    });
    return sessions.map((s) => ({
      id: s.id,
      topicId: s.topicId,
      topicTitle: s.topic?.title,
      status: s.status,
      openedAt: s.openedAt.toISOString(),
      closedAt: s.closedAt?.toISOString(),
    }));
  }

  @Get('meetings/:meetingId/audit')
  async getAudit(@Param('meetingId') meetingId: string, @CurrentUser() user: CurrentUserPayload) {
    await this.meetingsService.findOne(meetingId, user.id, user.role as Role);
    return this.auditService.findByMeeting(meetingId);
  }

  @Get('meetings/:meetingId/votes/export')
  @UseGuards(RolesGuard)
  @Roles(Role.SECRETARY, Role.PRESIDENT, Role.RDR)
  async exportVotes(
    @Param('meetingId') meetingId: string,
    @Query('format') format: string | undefined,
    @Res() res: Response,
  ) {
    const sessions = await this.prisma.voteSession.findMany({
      where: { meetingId },
      include: { topic: true, votes: true },
    });
    const lines = ['Tema,Elección,Usuario'];
    for (const s of sessions) {
      const votes = await this.prisma.vote.findMany({
        where: { voteSessionId: s.id },
        include: { session: false },
      });
      const userIds = [...new Set(votes.map((v) => v.userId))];
      // Deliberate fix (contract §Behaviour 2): never expose who voted in a
      // SECRET session.
      if (s.votingMethod === 'SECRET') {
        for (const v of votes) {
          lines.push(`${s.topic.title},${v.choice},Voto secreto`);
        }
        continue;
      }
      const users = await this.prisma.dirPerson.findMany({
        where: { id: { in: userIds } },
        select: { id: true, fullName: true },
      });
      const userMap = Object.fromEntries(users.map((u) => [u.id, u.fullName]));
      for (const v of votes) {
        lines.push(`${s.topic.title},${v.choice},${userMap[v.userId] ?? v.userId}`);
      }
    }
    const csv = lines.join('\n');
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="votes-${meetingId}.csv"`);
      res.send(csv);
    } else {
      res.json({ csv });
    }
  }
}
