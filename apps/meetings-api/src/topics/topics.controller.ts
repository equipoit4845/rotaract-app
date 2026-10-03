import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
  UploadedFile,
  UseInterceptors,
  Query,
  HttpCode,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '../prisma/client';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { MeetingsService } from '../meetings/meetings.service';
import { CreateTopicDto } from './dto/create-topic.dto';
import { ReorderTopicsDto } from './dto/reorder-topics.dto';
import { UpdateTopicDto } from './dto/update-topic.dto';
import { CreateTranscriptionDto } from './dto/transcription.dto';
import { TopicsService } from './topics.service';

@Controller('meetings/:meetingId/topics')
@UseGuards(AuthGuard('jwt'))
export class TopicsController {
  constructor(
    private readonly topicsService: TopicsService,
    private readonly meetingsService: MeetingsService,
  ) {}

  @Get()
  async findAll(@Param('meetingId') meetingId: string, @CurrentUser() user: CurrentUserPayload) {
    await this.meetingsService.findOne(meetingId, user.id, user.role as Role);
    return this.topicsService.findAll(meetingId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.SECRETARY, Role.PRESIDENT, Role.RDR)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  create(@Param('meetingId') meetingId: string, @Body() dto: CreateTopicDto) {
    return this.topicsService.create(meetingId, dto);
  }

  @Patch(':topicId')
  @UseGuards(RolesGuard)
  @Roles(Role.SECRETARY, Role.PRESIDENT, Role.RDR)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  update(@Param('meetingId') meetingId: string, @Param('topicId') topicId: string, @Body() dto: UpdateTopicDto) {
    return this.topicsService.update(meetingId, topicId, dto);
  }

  @Delete(':topicId')
  @UseGuards(RolesGuard)
  @Roles(Role.SECRETARY, Role.PRESIDENT, Role.RDR)
  remove(@Param('meetingId') meetingId: string, @Param('topicId') topicId: string) {
    return this.topicsService.remove(meetingId, topicId);
  }

  @Post('reorder')
  @UseGuards(RolesGuard)
  @Roles(Role.SECRETARY, Role.PRESIDENT, Role.RDR)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  reorder(@Param('meetingId') meetingId: string, @Body() dto: ReorderTopicsDto) {
    return this.topicsService.reorder(meetingId, dto);
  }

  @Post('current')
  @UseGuards(RolesGuard)
  @Roles(Role.SECRETARY, Role.PRESIDENT, Role.RDR)
  setCurrent(
    @Param('meetingId') meetingId: string,
    @Body('topicId') topicId: string | null,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.topicsService.setCurrentTopic(meetingId, topicId || null, user.id);
  }

  @Get('bulk/template')
  @UseGuards(RolesGuard)
  @Roles(Role.SECRETARY)
  async getBulkTemplate(
    @Param('meetingId') meetingId: string,
    @Res({ passthrough: false }) res: import('express').Response,
  ) {
    const { buffer, filename } = await this.topicsService.getBulkTemplate(meetingId);
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
    @Param('meetingId') meetingId: string,
    @CurrentUser() user: CurrentUserPayload,
    @UploadedFile() file: Express.Multer.File,
    @Query('mode') mode?: 'partial' | 'strict',
  ) {
    return this.topicsService.bulkImport(meetingId, file, user.id, mode);
  }

  @Post(':topicId/transcriptions')
  async addTranscription(
    @Param('meetingId') meetingId: string,
    @Param('topicId') topicId: string,
    @Body() dto: CreateTranscriptionDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    // Deliberate fix (contract §Behaviour 3): participant or admin only.
    await this.meetingsService.findOne(meetingId, user.id, user.role as Role);
    return this.topicsService.addTranscription(
      meetingId,
      topicId,
      user.id,
      user.fullName,
      dto.text,
      user.role,
      dto.speakerName,
    );
  }

  @Post(':topicId/transcriptions/audio')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
      fileFilter: (req, file, callback) => {
        if (!file.mimetype.startsWith('audio/') && file.mimetype !== 'application/octet-stream') {
          return callback(new BadRequestException('Only audio files are allowed'), false);
        }
        callback(null, true);
      },
    }),
  )
  async transcribeAudio(
    @Param('meetingId') meetingId: string,
    @Param('topicId') topicId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('speakerName') speakerName: string | undefined,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.topicsService.transcribeAudio(meetingId, topicId, user.id, user.fullName, file, user.role, speakerName);
  }
}
