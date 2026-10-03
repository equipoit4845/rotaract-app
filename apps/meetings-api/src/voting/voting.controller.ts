import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { BallotType, MajorityType, Role, VoteChoice, VotingMethod } from '../prisma/client';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { MeetingsService } from '../meetings/meetings.service';
import { VotingService } from './voting.service';

@Controller('meetings/:meetingId')
@UseGuards(AuthGuard('jwt'))
export class VotingController {
  constructor(
    private readonly votingService: VotingService,
    private readonly meetingsService: MeetingsService,
  ) {}

  @Post('vote/open')
  @UseGuards(RolesGuard)
  @Roles(Role.SECRETARY, Role.RDR)
  open(
    @Param('meetingId') meetingId: string,
    @Body()
    body: {
      topicId: string;
      votingMethod?: VotingMethod;
      requiredMajority?: MajorityType;
      isElection?: boolean;
      electionType?: string;
      ballotType?: BallotType;
      candidates?: { displayName: string; userId?: string }[];
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.votingService.openVote(meetingId, body.topicId, user.id, {
      votingMethod: body.votingMethod,
      requiredMajority: body.requiredMajority,
      isElection: body.isElection,
      electionType: body.electionType,
      ballotType: body.ballotType,
      candidates: body.candidates,
    });
  }

  @Post('vote/close')
  @UseGuards(RolesGuard)
  @Roles(Role.SECRETARY, Role.RDR)
  close(
    @Param('meetingId') meetingId: string,
    @Body('voteSessionId') voteSessionId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.votingService.closeVote(meetingId, voteSessionId, user.id);
  }

  /** Art. 49: RDR tiebreaker on YES/NO vote – only RDR can use, only on tied votes */
  @Post('vote/rdr-tiebreaker')
  @UseGuards(RolesGuard)
  @Roles(Role.RDR)
  rdrTiebreaker(
    @Param('meetingId') meetingId: string,
    @Body('voteSessionId') voteSessionId: string,
    @Body('choice') choice: VoteChoice,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.votingService.submitRdrTiebreaker(meetingId, voteSessionId, user.id, choice);
  }

  /** Art. 49 for candidate elections: RDR picks winning candidate on tie */
  @Post('vote/rdr-candidate-tiebreaker')
  @UseGuards(RolesGuard)
  @Roles(Role.RDR)
  rdrCandidateTiebreaker(
    @Param('meetingId') meetingId: string,
    @Body('voteSessionId') voteSessionId: string,
    @Body('candidateId') candidateId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.votingService.submitRdrCandidateTiebreaker(meetingId, voteSessionId, user.id, candidateId);
  }

  /** Art. 64i: Open second round (runoff) between top 2 candidates */
  @Post('vote/runoff')
  @UseGuards(RolesGuard)
  @Roles(Role.SECRETARY, Role.RDR)
  openRunoff(
    @Param('meetingId') meetingId: string,
    @Body('previousSessionId') previousSessionId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.votingService.openRunoff(meetingId, previousSessionId, user.id);
  }

  @Post('vote')
  submit(
    @Param('meetingId') meetingId: string,
    @Body('voteSessionId') voteSessionId: string,
    @Body('choice') choice: VoteChoice,
    @Body('candidateId') candidateId: string | undefined,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.votingService.submitVote(meetingId, voteSessionId, user.id, choice, candidateId);
  }

  @Post('vote/manual')
  @UseGuards(RolesGuard)
  @Roles(Role.SECRETARY, Role.RDR)
  submitManual(
    @Param('meetingId') meetingId: string,
    @Body('voteSessionId') voteSessionId: string,
    @Body('clubId') clubId: string,
    @Body('choice') choice: VoteChoice,
    @Body('candidateId') candidateId: string | undefined,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.votingService.submitManualVote(meetingId, voteSessionId, user.id, clubId, choice, candidateId);
  }

  // Deliberate fix (contract §Behaviour 3): participant or admin only.
  @Get('vote/current')
  async getCurrent(@Param('meetingId') meetingId: string, @CurrentUser() user: CurrentUserPayload) {
    await this.meetingsService.findOne(meetingId, user.id, user.role as Role);
    return this.votingService.getOpenSession(meetingId);
  }

  // Deliberate fix (contract §Behaviour 2/3): participant or admin only, and
  // an OPEN SECRET session is masked like the snapshot.
  @Get('vote/:voteSessionId/result')
  async getResult(
    @Param('meetingId') meetingId: string,
    @Param('voteSessionId') voteSessionId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    await this.meetingsService.findOne(meetingId, user.id, user.role as Role);
    return this.votingService.getPublicResult(meetingId, voteSessionId);
  }

  @Get('vote/:voteSessionId/detailed')
  @UseGuards(RolesGuard)
  @Roles(Role.SECRETARY, Role.PRESIDENT, Role.RDR)
  getDetailed(@Param('meetingId') meetingId: string, @Param('voteSessionId') voteSessionId: string) {
    return this.votingService.getDetailedResult(voteSessionId);
  }
}
