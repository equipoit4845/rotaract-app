import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '../prisma/client';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { MeetingsService } from '../meetings/meetings.service';
import { SpeakingQueueService } from './speaking-queue.service';

@Controller('meetings/:meetingId/queue')
@UseGuards(AuthGuard('jwt'))
export class SpeakingQueueController {
  constructor(
    private readonly queueService: SpeakingQueueService,
    private readonly meetingsService: MeetingsService,
  ) {}

  @Post('request')
  request(@Param('meetingId') meetingId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.queueService.request(meetingId, user.id);
  }

  @Post('cancel')
  cancel(
    @Param('meetingId') meetingId: string,
    @Body('requestId') requestId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.queueService.cancel(meetingId, requestId, user.id, user.role as Role);
  }

  @Get()
  async list(@Param('meetingId') meetingId: string, @CurrentUser() user: CurrentUserPayload) {
    await this.meetingsService.findOne(meetingId, user.id, user.role as Role);
    return this.queueService.list(meetingId);
  }

  @Get('state')
  async getState(@Param('meetingId') meetingId: string, @CurrentUser() user: CurrentUserPayload) {
    await this.meetingsService.findOne(meetingId, user.id, user.role as Role);
    return this.queueService.getQueueState(meetingId);
  }

  @Post('release-floor')
  releaseFloor(@Param('meetingId') meetingId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.queueService.releaseFloor(meetingId, user.id);
  }

  @Post('current-speaker')
  @UseGuards(RolesGuard)
  @Roles(Role.SECRETARY, Role.RDR)
  setCurrentSpeaker(
    @Param('meetingId') meetingId: string,
    @Body('userId') userId: string | null,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.queueService.setCurrentSpeaker(meetingId, userId || null, user.id);
  }

  @Post('next-speaker')
  @UseGuards(RolesGuard)
  @Roles(Role.SECRETARY, Role.RDR)
  setNextSpeaker(
    @Param('meetingId') meetingId: string,
    @Body('userId') userId: string | null,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.queueService.setNextSpeaker(meetingId, userId || null, user.id);
  }
}
