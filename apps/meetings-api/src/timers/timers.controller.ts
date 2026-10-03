import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '../prisma/client';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { MeetingsService } from '../meetings/meetings.service';
import { TimersService } from './timers.service';

@Controller('meetings/:meetingId/timers')
@UseGuards(AuthGuard('jwt'))
export class TimersController {
  constructor(
    private readonly timersService: TimersService,
    private readonly meetingsService: MeetingsService,
  ) {}

  @Post('topic/start')
  @UseGuards(RolesGuard)
  @Roles(Role.SECRETARY, Role.PRESIDENT, Role.RDR)
  startTopic(
    @Param('meetingId') meetingId: string,
    @Body('topicId') topicId: string,
    @Body('durationSec') durationSec: number,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.timersService.startTopicTimer(meetingId, topicId, durationSec ?? 300, user.id);
  }

  @Post('stop')
  @UseGuards(RolesGuard)
  @Roles(Role.SECRETARY, Role.PRESIDENT, Role.RDR)
  stop(
    @Param('meetingId') meetingId: string,
    @Body('timerId') timerId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.timersService.stopTimer(meetingId, timerId, user.id);
  }

  @Get('active')
  async getActive(@Param('meetingId') meetingId: string, @CurrentUser() user: CurrentUserPayload) {
    await this.meetingsService.findOne(meetingId, user.id, user.role as Role);
    return this.timersService.getActiveTimer(meetingId);
  }
}
