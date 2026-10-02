import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MajorityType, Role, VotingMethod } from '../prisma/client';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { MotionsService } from './motions.service';
import { MeetingsService } from '../meetings/meetings.service';

@Controller('meetings/:meetingId/motions')
@UseGuards(AuthGuard('jwt'))
export class MotionsController {
  constructor(
    private readonly motionsService: MotionsService,
    private readonly meetingsService: MeetingsService,
  ) {}

  @Post()
  async propose(
    @Param('meetingId') meetingId: string,
    @Body('title') title: string,
    @Body('description') description: string | undefined,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    // Deliberate fix (contract §Behaviour 3): participant or admin only.
    await this.meetingsService.findOne(meetingId, user.id, user.role as Role);
    return this.motionsService.propose(meetingId, user.id, title, description);
  }

  @Post(':motionId/second')
  async second(
    @Param('meetingId') meetingId: string,
    @Param('motionId') motionId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    await this.meetingsService.findOne(meetingId, user.id, user.role as Role);
    return this.motionsService.second(meetingId, motionId, user.id);
  }

  @Post(':motionId/launch-vote')
  @UseGuards(RolesGuard)
  @Roles(Role.SECRETARY, Role.RDR)
  launchVote(
    @Param('meetingId') meetingId: string,
    @Param('motionId') motionId: string,
    @Body('votingMethod') votingMethod: VotingMethod,
    @Body('requiredMajority') requiredMajority: MajorityType,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.motionsService.launchVote(meetingId, motionId, user.id, {
      votingMethod,
      requiredMajority,
    });
  }
}
