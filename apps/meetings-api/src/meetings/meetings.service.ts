import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MeetingStatus, MeetingType, Role } from '../prisma/client';
import { AuditService } from '../audit/audit.service';
import { DirectoryService } from '../directory/directory.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CsvParserService } from '../common/bulk/csv-parser.service';
import { BulkImportResult } from '../common/bulk/bulk-result.types';
import { QuorumService } from './quorum.service';
import { ActaService } from './acta.service';
import { AssignParticipantsDto } from './dto/assign-participants.dto';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';

@Injectable()
export class MeetingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly directory: DirectoryService,
    private readonly realtime: RealtimeGateway,
    private readonly csvParser: CsvParserService,
    private readonly quorum: QuorumService,
    private readonly acta: ActaService,
  ) {}

  getBulkTemplate(): { buffer: Buffer; filename: string } {
    const header = ['title', 'description', 'clubId', 'scheduledAt'];
    const example = [
      'Reunión trimestral Q1',
      'Revisión de objetivos',
      'clxxx', // club id
      '2025-04-15 09:00',
    ];
    const buffer = this.csvParser.generateTemplateCsv(header, example);
    return { buffer, filename: 'plantilla-reuniones.csv' };
  }

  async getParticipantsBulkTemplate(meetingId: string): Promise<{ buffer: Buffer; filename: string }> {
    await this.assertMeetingExists(meetingId);
    const header = ['email', 'canVote'];
    const example = ['usuario@club.org', 'true'];
    const buffer = this.csvParser.generateTemplateCsv(header, example);
    return { buffer, filename: 'plantilla-participantes-reunion.csv' };
  }

  private parseBool(val: string | undefined, defaultVal: boolean): boolean {
    if (!val || val.trim() === '') return defaultVal;
    const v = val.trim().toLowerCase();
    return v === 'true' || v === '1' || v === 'sí' || v === 'si' || v === 's' || v === 'yes';
  }

  async bulkImport(
    file: Express.Multer.File | undefined,
    actorUserId: string,
    mode: 'partial' | 'strict' = 'partial',
  ): Promise<BulkImportResult> {
    if (!file?.buffer) {
      throw new BadRequestException('Archivo CSV requerido');
    }

    const rows = this.csvParser.parse(file.buffer);
    const result: BulkImportResult = {
      total: rows.length,
      created: 0,
      failed: 0,
      mode,
      createdIds: [],
      errors: [],
    };

    const headerCols = ['title', 'description', 'clubId', 'scheduledAt'];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      const dto = plainToInstance(CreateMeetingDto, {
        title: row.title?.trim() || '',
        description: row.description?.trim() || undefined,
        clubId: row.clubId?.trim() || '',
        scheduledAt: row.scheduledAt?.trim() || undefined,
      });

      const validationErrors = await validate(dto);
      if (validationErrors.length > 0) {
        const msg = validationErrors.map((e) => Object.values(e.constraints || {}).join(', ')).join('; ');
        result.errors.push({
          row: rowNum,
          data: row as Record<string, unknown>,
          message: msg,
        });
        result.failed++;
        if (mode === 'strict') {
          for (let j = i + 1; j < rows.length; j++) {
            result.errors.push({
              row: j + 2,
              data: rows[j] as Record<string, unknown>,
              message: 'Importación abortada (modo estricto)',
            });
            result.failed++;
          }
          return result;
        }
        continue;
      }

      try {
        const club = await this.prisma.dirClub.findFirst({
          where: {
            OR: [{ id: (dto as CreateMeetingDto).clubId }, { code: (dto as CreateMeetingDto).clubId.toUpperCase() }],
          },
        });
        if (!club) {
          result.errors.push({
            row: rowNum,
            data: row as Record<string, unknown>,
            message: `Club no encontrado: ${(dto as CreateMeetingDto).clubId}`,
          });
          result.failed++;
          if (mode === 'strict') {
            for (let j = i + 1; j < rows.length; j++) {
              result.errors.push({
                row: j + 2,
                data: rows[j] as Record<string, unknown>,
                message: 'Importación abortada: club no encontrado',
              });
              result.failed++;
            }
            return result;
          }
          continue;
        }

        const meeting = await this.prisma.meeting.create({
          data: {
            title: (dto as CreateMeetingDto).title.trim(),
            description: (dto as CreateMeetingDto).description?.trim() ?? null,
            scheduledAt: (dto as CreateMeetingDto).scheduledAt
              ? new Date((dto as CreateMeetingDto).scheduledAt!)
              : null,
            status: MeetingStatus.DRAFT,
            createdById: actorUserId,
            clubId: club.id,
          },
        });

        await this.audit.log({
          meetingId: meeting.id,
          actorUserId,
          action: 'meeting.created',
          entityType: 'Meeting',
          entityId: meeting.id,
        });

        result.created++;
        result.createdIds!.push(meeting.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error desconocido';
        result.errors.push({
          row: rowNum,
          data: row as Record<string, unknown>,
          message: msg,
        });
        result.failed++;
        if (mode === 'strict') {
          for (let j = i + 1; j < rows.length; j++) {
            result.errors.push({
              row: j + 2,
              data: rows[j] as Record<string, unknown>,
              message: `Importación abortada: ${msg}`,
            });
            result.failed++;
          }
          return result;
        }
      }
    }

    if (result.created > 0) {
      await this.audit.log({
        actorUserId,
        action: 'BULK_IMPORT',
        entityType: 'Meeting',
        metadata: { total: result.total, created: result.created, failed: result.failed },
      });
    }

    if (result.errors.length > 0) {
      result.reportCsv = this.csvParser.generateReportCsv(headerCols, result.errors);
    }

    return result;
  }

  async bulkImportParticipants(
    meetingId: string,
    file: Express.Multer.File | undefined,
    actorUserId: string,
    mode: 'partial' | 'strict' = 'partial',
  ): Promise<BulkImportResult> {
    await this.assertMeetingExists(meetingId);
    if (!file?.buffer) {
      throw new BadRequestException('Archivo CSV requerido');
    }

    const rows = this.csvParser.parse(file.buffer);
    const result: BulkImportResult = {
      total: rows.length,
      created: 0,
      failed: 0,
      mode,
      createdIds: [],
      errors: [],
    };

    const headerCols = ['email', 'canVote'];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      const email = row.email?.trim()?.toLowerCase();
      if (!email) {
        result.errors.push({
          row: rowNum,
          data: row as Record<string, unknown>,
          message: 'Email obligatorio',
        });
        result.failed++;
        if (mode === 'strict') {
          for (let j = i + 1; j < rows.length; j++) {
            result.errors.push({
              row: j + 2,
              data: rows[j] as Record<string, unknown>,
              message: 'Importación abortada (modo estricto)',
            });
            result.failed++;
          }
          return result;
        }
        continue;
      }

      const user = await this.prisma.dirPerson.findFirst({
        where: { email: { equals: email, mode: 'insensitive' }, isActive: true },
      });
      if (!user) {
        result.errors.push({
          row: rowNum,
          data: row as Record<string, unknown>,
          message: `Usuario no encontrado: ${row.email}`,
        });
        result.failed++;
        if (mode === 'strict') {
          for (let j = i + 1; j < rows.length; j++) {
            result.errors.push({
              row: j + 2,
              data: rows[j] as Record<string, unknown>,
              message: 'Importación abortada: usuario no encontrado',
            });
            result.failed++;
          }
          return result;
        }
        continue;
      }

      try {
        const canVote = this.parseBool(row.canVote, true);
        await this.prisma.meetingParticipant.upsert({
          where: {
            meetingId_userId: { meetingId, userId: user.id },
          },
          create: { meetingId, userId: user.id, canVote },
          update: { canVote },
        });
        result.created++;
        result.createdIds!.push(user.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error desconocido';
        result.errors.push({
          row: rowNum,
          data: row as Record<string, unknown>,
          message: msg,
        });
        result.failed++;
        if (mode === 'strict') {
          for (let j = i + 1; j < rows.length; j++) {
            result.errors.push({
              row: j + 2,
              data: rows[j] as Record<string, unknown>,
              message: `Importación abortada: ${msg}`,
            });
            result.failed++;
          }
          return result;
        }
      }
    }

    if (result.created > 0) {
      await this.audit.log({
        meetingId,
        actorUserId,
        action: 'meeting.participants.bulk',
        entityType: 'MeetingParticipant',
        metadata: { total: result.total, created: result.created, failed: result.failed },
      });
      await this.realtime.broadcastSnapshot(meetingId);
    }

    if (result.errors.length > 0) {
      result.reportCsv = this.csvParser.generateReportCsv(headerCols, result.errors);
    }

    return result;
  }

  async create(dto: CreateMeetingDto, createdById: string) {
    const isDistrict = dto.isDistrictMeeting ?? true;
    const quorumRequired = isDistrict ? await this.quorum.calculateQuorumRequirement() : null;

    const meeting = await this.prisma.meeting.create({
      data: {
        title: dto.title,
        description: dto.description ?? null,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        status: MeetingStatus.DRAFT,
        type: dto.type ?? MeetingType.ORDINARY,
        isDistrictMeeting: isDistrict,
        quorumRequired,
        createdById,
        clubId: dto.clubId,
      },
      include: { club: true },
    });
    await this.audit.log({
      meetingId: meeting.id,
      actorUserId: createdById,
      action: 'meeting.created',
      entityType: 'Meeting',
      entityId: meeting.id,
    });
    const enabledClubs = await this.directory.findEnabledForDistrictMeetings();
    // Map each president to their club for per-club voting
    const participants: { userId: string; clubId: string }[] = [];
    const seenUserIds = new Set<string>();
    for (const club of enabledClubs) {
      for (const m of club.memberships) {
        if (!seenUserIds.has(m.personId)) {
          seenUserIds.add(m.personId);
          participants.push({ userId: m.personId, clubId: club.id });
        }
      }
    }
    if (participants.length > 0) {
      await this.prisma.meetingParticipant.createMany({
        data: participants.map((p) => ({
          meetingId: meeting.id,
          userId: p.userId,
          clubId: p.clubId,
          canVote: true,
        })),
      });
    }
    return meeting;
  }

  async findAll(userId: string, role: Role) {
    if (role === Role.SECRETARY || role === Role.PRESIDENT || role === Role.RDR || role === Role.SUPERADMIN) {
      return this.prisma.meeting.findMany({
        orderBy: [{ scheduledAt: 'desc' }, { createdAt: 'desc' }],
        include: { club: true },
      });
    }
    return this.prisma.meeting.findMany({
      where: {
        participants: { some: { userId } },
        status: { not: MeetingStatus.DRAFT },
      },
      orderBy: [{ scheduledAt: 'desc' }],
      include: { club: true },
    });
  }

  async findOne(id: string, userId: string, role: Role) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id },
      include: { club: true, participants: { include: { user: true } } },
    });
    if (!meeting) throw new NotFoundException('Reunión no encontrada');
    if (role !== Role.SECRETARY && role !== Role.PRESIDENT && role !== Role.RDR && role !== Role.SUPERADMIN) {
      // Deliberate fix (contract §Behaviour 1): legacy inverted this check and let
      // non-participants read DRAFT meetings. Non-admins never see a DRAFT, and
      // only participants see the rest.
      const isParticipant = meeting.participants.some((p) => p.userId === userId);
      if (!isParticipant || meeting.status === MeetingStatus.DRAFT)
        throw new NotFoundException('No tenés acceso a esta reunión');
    }
    return meeting;
  }

  async update(id: string, dto: UpdateMeetingDto, actorUserId: string) {
    await this.assertMeetingExists(id);
    const meeting = await this.prisma.meeting.update({
      where: { id },
      data: {
        ...(dto.title != null && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.scheduledAt !== undefined && {
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        }),
      },
      include: { club: true },
    });
    await this.audit.log({
      meetingId: id,
      actorUserId,
      action: 'meeting.updated',
      entityType: 'Meeting',
      entityId: id,
    });
    await this.realtime.broadcastSnapshot(id);
    return meeting;
  }

  async start(id: string, actorUserId: string) {
    const meeting = await this.prisma.meeting.findUnique({ where: { id } });
    if (!meeting) throw new NotFoundException('Reunión no encontrada');
    if (meeting.status !== MeetingStatus.SCHEDULED && meeting.status !== MeetingStatus.DRAFT)
      throw new BadRequestException('Solo se puede iniciar una reunión programada o en borrador');

    // Art. 41-42: Check quorum on start for district meetings
    let quorumMet = true;
    let isInformationalOnly = false;
    let quorumRequired = meeting.quorumRequired;
    if (meeting.isDistrictMeeting) {
      const quorumStatus = await this.quorum.checkQuorum(id);
      quorumRequired = quorumStatus.required;
      quorumMet = quorumStatus.met;
      isInformationalOnly = !quorumMet; // Art. 42: no quorum = informational only
    }

    // Ensure attendance topic exists as the first topic
    const topics = await this.prisma.agendaTopic.findMany({
      where: { meetingId: id },
      orderBy: { order: 'asc' },
    });
    let firstTopic = topics[0];
    const hasAttendance = topics.some((t) => t.isAttendanceTopic || t.title.toLowerCase().includes('asistencia'));
    if (!hasAttendance) {
      const minOrder = topics.length > 0 ? topics[0].order - 1 : 0;
      firstTopic = await this.prisma.agendaTopic.create({
        data: {
          meetingId: id,
          title: 'Asistencia',
          description: 'Registro de asistencia y verificación de quórum',
          order: minOrder,
          type: 'DISCUSSION',
          status: 'ACTIVE',
          isAttendanceTopic: true,
        },
      });
    } else {
      const attendanceTopic = topics.find((t) => t.isAttendanceTopic || t.title.toLowerCase().includes('asistencia'))!;
      if (attendanceTopic.id !== firstTopic.id) {
        await this.prisma.agendaTopic.update({
          where: { id: attendanceTopic.id },
          data: { order: firstTopic.order - 1, status: 'ACTIVE', isAttendanceTopic: true },
        });
        firstTopic = {
          ...attendanceTopic,
          order: firstTopic.order - 1,
          status: 'ACTIVE',
          isAttendanceTopic: true,
        } as any;
      } else {
        await this.prisma.agendaTopic.update({
          where: { id: attendanceTopic.id },
          data: { status: 'ACTIVE', isAttendanceTopic: true },
        });
        firstTopic = { ...attendanceTopic, status: 'ACTIVE', isAttendanceTopic: true } as any;
      }
    }

    const updated = await this.prisma.meeting.update({
      where: { id },
      data: {
        status: MeetingStatus.LIVE,
        startedAt: new Date(),
        quorumRequired,
        quorumMet,
        isInformationalOnly,
        currentTopicId: firstTopic.id,
      },
      include: { club: true },
    });
    await this.audit.log({
      meetingId: id,
      actorUserId,
      action: 'meeting.started',
      entityType: 'Meeting',
      entityId: id,
    });
    await this.realtime.broadcastSnapshot(id);
    return updated;
  }

  async pause(id: string, actorUserId: string) {
    const meeting = await this.prisma.meeting.findUnique({ where: { id } });
    if (!meeting) throw new NotFoundException('Reunión no encontrada');
    if (meeting.status !== MeetingStatus.LIVE)
      throw new BadRequestException('Solo se puede pausar una reunión en vivo');
    const updated = await this.prisma.meeting.update({
      where: { id },
      data: { status: MeetingStatus.PAUSED },
      include: { club: true },
    });
    await this.audit.log({
      meetingId: id,
      actorUserId,
      action: 'meeting.paused',
      entityType: 'Meeting',
      entityId: id,
    });
    await this.realtime.broadcastSnapshot(id);
    return updated;
  }

  async resume(id: string, actorUserId: string) {
    const meeting = await this.prisma.meeting.findUnique({ where: { id } });
    if (!meeting) throw new NotFoundException('Reunión no encontrada');
    if (meeting.status !== MeetingStatus.PAUSED)
      throw new BadRequestException('Solo se puede reanudar una reunión pausada');
    const updated = await this.prisma.meeting.update({
      where: { id },
      data: { status: MeetingStatus.LIVE },
      include: { club: true },
    });
    await this.audit.log({
      meetingId: id,
      actorUserId,
      action: 'meeting.resumed',
      entityType: 'Meeting',
      entityId: id,
    });
    await this.realtime.broadcastSnapshot(id);
    return updated;
  }

  async finish(id: string, actorUserId: string) {
    const meeting = await this.prisma.meeting.findUnique({ where: { id } });
    if (!meeting) throw new NotFoundException('Reunión no encontrada');
    if (meeting.status !== MeetingStatus.LIVE && meeting.status !== MeetingStatus.PAUSED)
      throw new BadRequestException('Solo se puede finalizar una reunión en vivo o pausada');
    const updated = await this.prisma.meeting.update({
      where: { id },
      data: { status: MeetingStatus.FINISHED, endedAt: new Date() },
      include: { club: true },
    });
    await this.audit.log({
      meetingId: id,
      actorUserId,
      action: 'meeting.finished',
      entityType: 'Meeting',
      entityId: id,
    });
    await this.realtime.broadcastSnapshot(id);

    // Auto-generate acta draft (Art. 27a)
    try {
      await this.acta.generateDraft(id);
    } catch {
      // Non-blocking: if acta generation fails, meeting is still finished
    }

    return updated;
  }

  async lockAttendance(id: string, actorUserId: string) {
    const meeting = await this.prisma.meeting.findUnique({ where: { id } });
    if (!meeting) throw new NotFoundException('Reunión no encontrada');
    // Recalculate quorum before locking
    let quorumRequired = meeting.quorumRequired;
    let quorumMet = meeting.quorumMet;
    let isInformationalOnly = meeting.isInformationalOnly;
    if (meeting.isDistrictMeeting) {
      const quorumStatus = await this.quorum.checkQuorum(id);
      quorumRequired = quorumStatus.required;
      quorumMet = quorumStatus.met;
      isInformationalOnly = !quorumMet;
    }

    // Set attendance topic status to DONE
    const firstTopic = await this.prisma.agendaTopic.findFirst({
      where: { meetingId: id },
      orderBy: { order: 'asc' },
    });
    if (firstTopic && firstTopic.title.toLowerCase().includes('asistencia')) {
      await this.prisma.agendaTopic.update({
        where: { id: firstTopic.id },
        data: { status: 'DONE' },
      });
    }

    const updated = await this.prisma.meeting.update({
      where: { id },
      data: {
        attendanceLocked: true,
        attendanceLockedAt: new Date(),
        quorumRequired,
        quorumMet,
        isInformationalOnly,
      },
      include: { club: true },
    });
    await this.audit.log({
      meetingId: id,
      actorUserId,
      action: 'meeting.attendance.locked',
      entityType: 'Meeting',
      entityId: id,
    });
    await this.realtime.broadcastSnapshot(id);
    return updated;
  }

  async toggleTranscription(id: string, actorUserId: string, enabled: boolean) {
    const meeting = await this.prisma.meeting.findUnique({ where: { id } });
    if (!meeting) throw new NotFoundException('Reunión no encontrada');

    const updated = await this.prisma.meeting.update({
      where: { id },
      data: { transcriptionEnabled: enabled },
    });
    await this.audit.log({
      meetingId: id,
      actorUserId,
      action: enabled ? 'meeting.transcription.enabled' : 'meeting.transcription.disabled',
      entityType: 'Meeting',
      entityId: id,
    });
    await this.realtime.broadcastSnapshot(id);
    return updated;
  }

  async schedule(id: string, actorUserId: string) {
    const meeting = await this.prisma.meeting.findUnique({ where: { id } });
    if (!meeting) throw new NotFoundException('Reunión no encontrada');
    if (meeting.status !== MeetingStatus.DRAFT) throw new BadRequestException('Solo se puede programar un borrador');
    const updated = await this.prisma.meeting.update({
      where: { id },
      data: { status: MeetingStatus.SCHEDULED },
      include: { club: true },
    });
    await this.audit.log({
      meetingId: id,
      actorUserId,
      action: 'meeting.updated',
      entityType: 'Meeting',
      entityId: id,
      metadata: { transition: 'schedule' },
    });
    await this.realtime.broadcastSnapshot(id);
    return updated;
  }

  async assignParticipants(id: string, dto: AssignParticipantsDto, actorUserId: string) {
    await this.assertMeetingExists(id);
    const newParticipantUserIds = dto.participants.map((p) => p.userId);

    await this.prisma.$transaction(async (tx) => {
      // Delete participants no longer in the list
      await tx.meetingParticipant.deleteMany({
        where: {
          meetingId: id,
          userId: { notIn: newParticipantUserIds },
        },
      });

      // Upsert current participants to preserve status/joinedAt
      for (const p of dto.participants) {
        await tx.meetingParticipant.upsert({
          where: {
            meetingId_userId: { meetingId: id, userId: p.userId },
          },
          create: {
            meetingId: id,
            userId: p.userId,
            canVote: p.canVote ?? true,
          },
          update: {
            canVote: p.canVote ?? true,
          },
        });
      }
    });

    await this.audit.log({
      meetingId: id,
      actorUserId,
      action: 'meeting.participants.updated',
      entityType: 'Meeting',
      entityId: id,
    });
    await this.realtime.broadcastSnapshot(id);
    return this.prisma.meeting.findUnique({
      where: { id },
      include: { participants: { include: { user: true } } },
    });
  }

  async updateClubRepresentative(meetingId: string, clubId: string, userId: string, actorUserId: string) {
    await this.assertMeetingExists(meetingId);

    const membership = await this.directory.isActiveMember(userId, clubId);
    if (!membership) {
      throw new BadRequestException('El usuario no pertenece a este club o su membresía no está activa');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.meetingParticipant.deleteMany({
        where: { meetingId, clubId, userId: { not: userId } },
      });

      await tx.meetingParticipant.upsert({
        where: { meetingId_userId: { meetingId, userId } },
        create: {
          meetingId,
          userId,
          clubId,
          isDelegate: false,
          canVote: true,
          attendanceStatus: 'JOINED',
          joinedAt: new Date(),
        },
        update: {
          clubId,
          canVote: true,
          attendanceStatus: 'JOINED',
        },
      });

      await tx.clubMeetingAttendance.upsert({
        where: { meetingId_clubId: { meetingId, clubId } },
        create: {
          meetingId,
          clubId,
          attendeeUserId: userId,
          isDelegate: false,
        },
        update: {
          attendeeUserId: userId,
        },
      });
    });

    await this.audit.log({
      meetingId,
      actorUserId,
      action: 'meeting.club_representative.updated',
      entityType: 'Meeting',
      entityId: meetingId,
      metadata: { clubId, userId },
    });

    await this.quorum.recheckAndUpdateQuorum(meetingId);
    await this.realtime.broadcastSnapshot(meetingId);

    return { message: 'Representante del club actualizado con éxito' };
  }

  async removeClubAttendance(meetingId: string, clubId: string, actorUserId: string) {
    await this.assertMeetingExists(meetingId);

    const meeting = await this.prisma.meeting.findUnique({ where: { id: meetingId } });
    if (meeting?.status === MeetingStatus.FINISHED || meeting?.status === MeetingStatus.ARCHIVED) {
      throw new BadRequestException('No se puede modificar la asistencia de una reunión finalizada o archivada');
    }

    await this.prisma.$transaction(async (tx) => {
      // Clear normal votes in active open sessions
      // ballotClubId also covers SECRET votes (legacy missed them: clubId is null there)
      await tx.vote.deleteMany({
        where: {
          session: {
            meetingId,
            status: 'OPEN',
          },
          OR: [{ clubId }, { ballotClubId: clubId }],
        },
      });

      // Clear sealed votes in active open sessions
      await tx.sealedVote.deleteMany({
        where: {
          session: {
            meetingId,
            status: 'OPEN',
          },
          clubId,
        },
      });

      await tx.clubMeetingAttendance.deleteMany({
        where: { meetingId, clubId },
      });
      await tx.meetingParticipant.deleteMany({
        where: { meetingId, clubId },
      });
    });

    await this.audit.log({
      meetingId,
      actorUserId,
      action: 'meeting.club_attendance.removed',
      entityType: 'Meeting',
      entityId: meetingId,
      metadata: { clubId },
    });

    await this.quorum.recheckAndUpdateQuorum(meetingId);
    await this.realtime.broadcastSnapshot(meetingId);

    return { message: 'Asistencia del club eliminada con éxito' };
  }

  private async assertMeetingExists(id: string) {
    const m = await this.prisma.meeting.findUnique({ where: { id } });
    if (!m) throw new NotFoundException('Reunión no encontrada');
  }
}
