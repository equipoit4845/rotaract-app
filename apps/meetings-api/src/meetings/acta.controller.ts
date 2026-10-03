import { Body, Controller, Get, Param, Patch, Post, Res, UseGuards, Query } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '../prisma/client';
import { Response } from 'express';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ActaService } from './acta.service';
import { MeetingsService } from './meetings.service';

@Controller('meetings/:meetingId/acta')
@UseGuards(AuthGuard('jwt'))
export class ActaController {
  constructor(
    private readonly actaService: ActaService,
    private readonly meetingsService: MeetingsService,
  ) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.SECRETARY, Role.PRESIDENT, Role.RDR, Role.PARTICIPANT)
  async get(@Param('meetingId') meetingId: string) {
    return this.actaService.findByMeeting(meetingId);
  }

  @Post('generate')
  @UseGuards(RolesGuard)
  @Roles(Role.SECRETARY, Role.RDR)
  async generate(@Param('meetingId') meetingId: string) {
    return this.actaService.generateDraft(meetingId);
  }

  @Post('autocomplete-ai')
  @UseGuards(RolesGuard)
  @Roles(Role.SECRETARY)
  async autocompleteAI(@Param('meetingId') meetingId: string, @Query('force') force?: string) {
    const forceOverwrite = force === 'true';
    return this.actaService.autocompleteAI(meetingId, forceOverwrite);
  }

  @Patch()
  @UseGuards(RolesGuard)
  @Roles(Role.SECRETARY)
  async update(
    @Param('meetingId') meetingId: string,
    @Body('contentJson') contentJson: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.actaService.update(meetingId, contentJson, user.id);
  }

  @Post('publish')
  @UseGuards(RolesGuard)
  @Roles(Role.SECRETARY)
  async publish(@Param('meetingId') meetingId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.actaService.publish(meetingId, user.id);
  }

  @Get('pdf')
  async downloadPdf(
    @Param('meetingId') meetingId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Res() res: Response,
  ) {
    // Deliberate fix (contract §Behaviour 3): legacy had no guard here.
    await this.meetingsService.findOne(meetingId, user.id, user.role as Role);
    const buffer = await this.actaService.generatePdf(meetingId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="acta-${meetingId}.pdf"`);
    res.send(buffer);
  }
}
