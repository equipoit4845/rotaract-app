import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Delete,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '../prisma/client';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AssignParticipantsDto } from './dto/assign-participants.dto';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import { MeetingsService } from './meetings.service';
import { AttachmentsService } from '../attachments/attachments.service';

@Controller('meetings')
@UseGuards(AuthGuard('jwt'))
export class MeetingsController {
  constructor(
    private readonly meetingsService: MeetingsService,
    private readonly attachmentsService: AttachmentsService,
  ) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.SECRETARY, Role.RDR)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  create(@Body() dto: CreateMeetingDto, @CurrentUser() user: CurrentUserPayload) {
    return this.meetingsService.create(dto, user.id);
  }

  @Get()
  findAll(@CurrentUser() user: CurrentUserPayload) {
    return this.meetingsService.findAll(user.id, user.role as Role);
  }

  @Get('bulk/template')
  @UseGuards(RolesGuard)
  @Roles(Role.SECRETARY)
  getBulkTemplate(@Res({ passthrough: false }) res: import('express').Response) {
    const { buffer, filename } = this.meetingsService.getBulkTemplate();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Post('bulk')
  @HttpCode(207)
  @UseGuards(RolesGuard)
  @Roles(Role.SECRETARY)
  @UseInterceptors(FileInterceptor('file'))
  async bulkImport(
    @CurrentUser() user: CurrentUserPayload,
    @UploadedFile() file: Express.Multer.File,
    @Query('mode') mode?: 'partial' | 'strict',
  ) {
    return this.meetingsService.bulkImport(file, user.id, mode);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.meetingsService.findOne(id, user.id, user.role as Role);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.SECRETARY, Role.RDR)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  update(@Param('id') id: string, @Body() dto: UpdateMeetingDto, @CurrentUser() user: CurrentUserPayload) {
    return this.meetingsService.update(id, dto, user.id);
  }

  @Post(':id/start')
  @UseGuards(RolesGuard)
  @Roles(Role.SECRETARY, Role.RDR)
  start(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.meetingsService.start(id, user.id);
  }

  @Post(':id/pause')
  @UseGuards(RolesGuard)
  @Roles(Role.SECRETARY, Role.RDR)
  pause(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.meetingsService.pause(id, user.id);
  }

  @Post(':id/resume')
  @UseGuards(RolesGuard)
  @Roles(Role.SECRETARY, Role.RDR)
  resume(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.meetingsService.resume(id, user.id);
  }

  @Post(':id/finish')
  @UseGuards(RolesGuard)
  @Roles(Role.SECRETARY, Role.RDR)
  finish(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.meetingsService.finish(id, user.id);
  }

  @Post(':id/lock-attendance')
  @UseGuards(RolesGuard)
  @Roles(Role.SECRETARY, Role.RDR)
  lockAttendance(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.meetingsService.lockAttendance(id, user.id);
  }

  @Post(':id/transcription')
  @UseGuards(RolesGuard)
  @Roles(Role.SECRETARY, Role.RDR)
  toggleTranscription(
    @Param('id') id: string,
    @Body() body: { enabled: boolean },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.meetingsService.toggleTranscription(id, user.id, body.enabled);
  }

  @Post(':id/schedule')
  @UseGuards(RolesGuard)
  @Roles(Role.SECRETARY, Role.RDR)
  schedule(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.meetingsService.schedule(id, user.id);
  }

  @Get(':id/participants/bulk/template')
  @UseGuards(RolesGuard)
  @Roles(Role.SECRETARY)
  async getParticipantsBulkTemplate(
    @Param('id') id: string,
    @Res({ passthrough: false }) res: import('express').Response,
  ) {
    const { buffer, filename } = await this.meetingsService.getParticipantsBulkTemplate(id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Post(':id/participants/bulk')
  @HttpCode(207)
  @UseGuards(RolesGuard)
  @Roles(Role.SECRETARY)
  @UseInterceptors(FileInterceptor('file'))
  async bulkImportParticipants(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @UploadedFile() file: Express.Multer.File,
    @Query('mode') mode?: 'partial' | 'strict',
  ) {
    return this.meetingsService.bulkImportParticipants(id, file, user.id, mode);
  }

  @Post(':id/participants')
  @UseGuards(RolesGuard)
  @Roles(Role.SECRETARY, Role.RDR)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  assignParticipants(
    @Param('id') id: string,
    @Body() dto: AssignParticipantsDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.meetingsService.assignParticipants(id, dto, user.id);
  }

  @Get(':id/attachments')
  @UseGuards(RolesGuard)
  @Roles(Role.SECRETARY, Role.PRESIDENT, Role.RDR)
  listAttachments(@Param('id') id: string) {
    return this.attachmentsService.list('meeting', id);
  }

  @Post(':id/attachments')
  @UseGuards(RolesGuard)
  @Roles(Role.SECRETARY, Role.RDR)
  @UseInterceptors(FileInterceptor('file'))
  async uploadAttachment(
    @Param('id') id: string,
    @Req() req: { clubId?: string },
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (!file) {
      throw new BadRequestException('Archivo requerido (campo "file")');
    }
    return this.attachmentsService.upload('meeting', id, file, user.id, {
      clubId: req.clubId,
      role: user.role as Role,
    });
  }

  @Delete(':id/attachments/:attachmentId')
  @UseGuards(RolesGuard)
  @Roles(Role.SECRETARY, Role.RDR)
  deleteAttachment(
    @Param('id') meetingId: string,
    @Param('attachmentId') attachmentId: string,
    @Req() req: { clubId?: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.attachmentsService.delete(attachmentId, {
      clubId: req.clubId,
      role: user.role as Role,
      actorUserId: user.id,
    });
  }

  @Post(':id/clubs/:clubId/representative')
  @UseGuards(RolesGuard)
  @Roles(Role.SECRETARY, Role.RDR)
  @HttpCode(200)
  updateClubRepresentative(
    @Param('id') meetingId: string,
    @Param('clubId') clubId: string,
    @Body() body: { userId: string },
    @CurrentUser() actor: CurrentUserPayload,
  ) {
    return this.meetingsService.updateClubRepresentative(meetingId, clubId, body.userId, actor.id);
  }

  @Delete(':id/clubs/:clubId/attendance')
  @UseGuards(RolesGuard)
  @Roles(Role.SECRETARY, Role.RDR)
  removeClubAttendance(
    @Param('id') meetingId: string,
    @Param('clubId') clubId: string,
    @CurrentUser() actor: CurrentUserPayload,
  ) {
    return this.meetingsService.removeClubAttendance(meetingId, clubId, actor.id);
  }
}
