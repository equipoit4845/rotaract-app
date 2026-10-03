import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MeetingStatus, Role } from '../prisma/client';
import * as ExcelJS from 'exceljs';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CreateTopicDto } from './dto/create-topic.dto';
import { ReorderTopicsDto } from './dto/reorder-topics.dto';
import { UpdateTopicDto } from './dto/update-topic.dto';
import { CsvParserService } from '../common/bulk/csv-parser.service';
import { BulkImportResult } from '../common/bulk/bulk-result.types';

@Injectable()
export class TopicsService {
  private readonly rateLimits = new Map<string, number[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly audit: AuditService,
    private readonly csvParser: CsvParserService,
  ) {}

  async findAll(meetingId: string) {
    return this.prisma.agendaTopic.findMany({
      where: { meetingId },
      orderBy: { order: 'asc' },
    });
  }

  async create(meetingId: string, dto: CreateTopicDto) {
    const meeting = await this.prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) throw new NotFoundException('Reunión no encontrada');
    const maxOrder = await this.prisma.agendaTopic
      .aggregate({ where: { meetingId }, _max: { order: true } })
      .then((r) => r._max.order ?? -1);

    let targetOrder = dto.order ?? maxOrder + 1;

    // If meeting is live/paused, ensure any new topic is placed after the attendance topic
    if (meeting.status === 'LIVE' || meeting.status === 'PAUSED') {
      const attendanceTopic = await this.prisma.agendaTopic.findFirst({
        where: { meetingId, title: { contains: 'asistencia', mode: 'insensitive' } },
      });
      if (attendanceTopic && targetOrder <= attendanceTopic.order) {
        targetOrder = attendanceTopic.order + 1;
      }
    }

    const topic = await this.prisma.agendaTopic.create({
      data: {
        meetingId,
        title: dto.title,
        description: dto.description ?? null,
        order: targetOrder,
        type: dto.type ?? 'DISCUSSION',
        estimatedDurationSec: dto.estimatedDurationSec ?? null,
      },
    });
    await this.realtime.broadcastSnapshot(meetingId);
    return topic;
  }

  async update(meetingId: string, topicId: string, dto: UpdateTopicDto) {
    await this.assertTopicInMeeting(meetingId, topicId);
    const topic = await this.prisma.agendaTopic.update({
      where: { id: topicId },
      data: {
        ...(dto.title != null && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.order != null && { order: dto.order }),
        ...(dto.type != null && { type: dto.type }),
        ...(dto.estimatedDurationSec !== undefined && { estimatedDurationSec: dto.estimatedDurationSec }),
        ...(dto.status != null && { status: dto.status }),
      },
    });
    await this.realtime.broadcastSnapshot(meetingId);
    return topic;
  }

  async remove(meetingId: string, topicId: string) {
    await this.assertTopicInMeeting(meetingId, topicId);
    const meeting = await this.prisma.meeting.findUnique({ where: { id: meetingId } });
    if (meeting?.currentTopicId === topicId) {
      await this.prisma.meeting.update({
        where: { id: meetingId },
        data: { currentTopicId: null },
      });
    }
    await this.prisma.agendaTopic.delete({ where: { id: topicId } });
    await this.realtime.broadcastSnapshot(meetingId);
    return { ok: true };
  }

  async reorder(meetingId: string, dto: ReorderTopicsDto) {
    const meeting = await this.prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) throw new NotFoundException('Reunión no encontrada');

    const topics = await this.prisma.agendaTopic.findMany({
      where: { meetingId, id: { in: dto.topicIds } },
    });
    if (topics.length !== dto.topicIds.length)
      throw new BadRequestException('Algunos temas no pertenecen a esta reunión');

    let targetTopicIds = [...dto.topicIds];
    if (meeting.status === 'LIVE' || meeting.status === 'PAUSED') {
      const attendanceTopic = topics.find((t) => t.title.toLowerCase().includes('asistencia'));
      if (attendanceTopic) {
        const index = targetTopicIds.indexOf(attendanceTopic.id);
        if (index > -1) {
          targetTopicIds.splice(index, 1);
        }
        targetTopicIds.unshift(attendanceTopic.id);
      }
    }

    await this.prisma.$transaction(
      targetTopicIds.map((id, index) =>
        this.prisma.agendaTopic.update({
          where: { id },
          data: { order: index },
        }),
      ),
    );
    return this.findAll(meetingId);
  }

  async setCurrentTopic(meetingId: string, topicId: string | null, actorUserId: string) {
    const meeting = await this.prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) throw new NotFoundException('Reunión no encontrada');
    if (meeting.status !== MeetingStatus.LIVE && meeting.status !== MeetingStatus.PAUSED)
      throw new BadRequestException('Solo se puede cambiar el tema actual en reunión en vivo o pausada');

    if (topicId) {
      await this.assertTopicInMeeting(meetingId, topicId);

      // Enforce: cannot advance in the agenda (order > first topic) until attendance is locked.
      if (!meeting.attendanceLocked) {
        const topics = await this.prisma.agendaTopic.findMany({
          where: { meetingId },
          orderBy: { order: 'asc' },
        });
        const firstTopic = topics[0];
        if (firstTopic && topicId !== firstTopic.id) {
          throw new BadRequestException(
            'Debe registrar y cerrar la asistencia (Cerrar Asistencia) antes de avanzar a otros temas del orden del día.',
          );
        }
      }
    }

    const updated = await this.prisma.meeting.update({
      where: { id: meetingId },
      data: { currentTopicId: topicId },
      include: { club: true },
    });
    await this.audit.log({
      meetingId,
      actorUserId,
      action: 'meeting.topic.changed',
      entityType: 'AgendaTopic',
      entityId: topicId ?? undefined,
    });
    await this.realtime.broadcastSnapshot(meetingId);
    return updated;
  }

  async getBulkTemplate(meetingId: string) {
    await this.assertMeetingExists(meetingId);
    const headers = ['title', 'description', 'type', 'durationMin'];
    const example = ['Aprobación del Balance', 'Lectura del balance financiero del período actual.', 'VOTING', '15'];
    const buffer = this.csvParser.generateTemplateCsv(headers, example);
    return {
      buffer,
      filename: 'plantilla-agenda-reunion.csv',
    };
  }

  async bulkImport(
    meetingId: string,
    file: Express.Multer.File | undefined,
    actorUserId: string,
    mode: 'partial' | 'strict' = 'partial',
  ): Promise<BulkImportResult> {
    await this.assertMeetingExists(meetingId);
    if (!file?.buffer) {
      throw new BadRequestException('Archivo requerido');
    }

    const isExcel =
      file.originalname?.endsWith('.xlsx') ||
      file.originalname?.endsWith('.xls') ||
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    const rows: Record<string, string>[] = [];
    let headers: string[] = [];

    if (isExcel) {
      try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(Buffer.from(file.buffer) as any);
        const worksheet = workbook.worksheets[0];
        if (!worksheet) {
          throw new BadRequestException('La planilla de Excel está vacía');
        }

        // Read header row (row 1)
        const headerRow = worksheet.getRow(1);
        headerRow.eachCell((cell) => {
          headers.push(String(cell.value || '').trim());
        });

        if (headers.length === 0 || headers.every((h) => !h)) {
          throw new BadRequestException('El archivo de Excel no tiene encabezados válidos');
        }

        // Read data rows
        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return; // skip header
          const data: Record<string, string> = {};
          headers.forEach((h, colIndex) => {
            const cell = row.getCell(colIndex + 1);
            let val = cell.value;
            // Handle rich text or objects
            if (val && typeof val === 'object') {
              if ('richText' in val) {
                val = val.richText.map((t) => t.text).join('');
              } else if ('text' in val) {
                val = (val as any).text;
              } else if ('result' in val) {
                val = (val as any).result;
              } else {
                val = String(val);
              }
            }
            data[h] = val != null ? String(val).trim() : '';
          });
          rows.push(data);
        });
      } catch (err) {
        throw new BadRequestException(
          `Error al procesar el archivo Excel: ${err instanceof Error ? err.message : 'formato inválido'}`,
        );
      }
    } else {
      // Parse as CSV
      const csvRows = this.csvParser.parse(file.buffer);
      if (csvRows.length > 0) {
        headers = Object.keys(csvRows[0]);
        csvRows.forEach((r) => {
          rows.push(r as Record<string, string>);
        });
      }
    }

    const result: BulkImportResult = {
      total: rows.length,
      created: 0,
      failed: 0,
      mode,
      createdIds: [],
      errors: [],
    };

    if (rows.length === 0) {
      return result;
    }

    const titleKey =
      headers.find(
        (h) => h.toLowerCase() === 'title' || h.toLowerCase() === 'titulo' || h.toLowerCase() === 'título',
      ) || 'title';
    const descKey =
      headers.find(
        (h) =>
          h.toLowerCase() === 'description' || h.toLowerCase() === 'descripcion' || h.toLowerCase() === 'descripción',
      ) || 'description';
    const typeKey = headers.find((h) => h.toLowerCase() === 'type' || h.toLowerCase() === 'tipo') || 'type';
    const durationKey =
      headers.find(
        (h) =>
          h.toLowerCase() === 'durationmin' ||
          h.toLowerCase() === 'duracionmin' ||
          h.toLowerCase() === 'duraciónmin' ||
          h.toLowerCase() === 'duracion' ||
          h.toLowerCase() === 'duración',
      ) || 'durationMin';

    let currentOrder = await this.prisma.agendaTopic
      .aggregate({ where: { meetingId }, _max: { order: true } })
      .then((r) => (r._max.order ?? -1) + 1);

    const transactionActions: any[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      const title = row[titleKey]?.trim();

      if (!title) {
        result.errors.push({
          row: rowNum,
          data: row as Record<string, unknown>,
          message: 'El título del tema es obligatorio',
        });
        result.failed++;
        if (mode === 'strict') {
          return this.abortStrict(rows, i, result, 'Título obligatorio');
        }
        continue;
      }

      const description = row[descKey]?.trim() || null;
      let rawType = row[typeKey]?.toUpperCase()?.trim();
      let type: 'DISCUSSION' | 'VOTING' | 'INFORMATIVE' = 'DISCUSSION';
      if (rawType === 'VOTING' || rawType === 'VOTACION' || rawType === 'VOTACIÓN') {
        type = 'VOTING';
      } else if (rawType === 'INFORMATIVE' || rawType === 'INFORMATIVO' || rawType === 'INFORMATIVA') {
        type = 'INFORMATIVE';
      }

      const durationMin = parseInt(row[durationKey], 10);
      const estimatedDurationSec = isNaN(durationMin) || durationMin <= 0 ? null : durationMin * 60;

      try {
        const data = {
          meetingId,
          title,
          description,
          order: currentOrder++,
          type,
          estimatedDurationSec,
        };

        if (mode === 'strict') {
          transactionActions.push(this.prisma.agendaTopic.create({ data }));
        } else {
          const created = await this.prisma.agendaTopic.create({ data });
          result.createdIds!.push(created.id);
        }
        result.created++;
      } catch (err) {
        result.errors.push({
          row: rowNum,
          data: row as Record<string, unknown>,
          message: err instanceof Error ? err.message : 'Error desconocido',
        });
        result.failed++;
        if (mode === 'strict') {
          return this.abortStrict(rows, i, result, 'Error de inserción');
        }
      }
    }

    if (mode === 'strict' && transactionActions.length > 0) {
      try {
        const createdTopics = await this.prisma.$transaction(transactionActions);
        result.createdIds = createdTopics.map((t) => t.id);
      } catch (err) {
        // Rollback details
        result.created = 0;
        result.createdIds = [];
        result.failed = rows.length;
        result.errors = rows.map((row, index) => ({
          row: index + 2,
          data: row as Record<string, unknown>,
          message: `Transacción cancelada: ${err instanceof Error ? err.message : 'Error en base de datos'}`,
        }));
      }
    }

    if (result.errors.length > 0) {
      result.reportCsv = this.csvParser.generateReportCsv(
        ['title', 'description', 'type', 'durationMin'],
        result.errors,
      );
    }

    return result;
  }

  private abortStrict(
    rows: Record<string, string>[],
    index: number,
    result: BulkImportResult,
    reason: string,
  ): BulkImportResult {
    for (let j = index + 1; j < rows.length; j++) {
      result.errors.push({
        row: j + 2,
        data: rows[j] as Record<string, unknown>,
        message: `Importación abortada (modo estricto): ${reason}`,
      });
      result.failed++;
    }
    result.created = 0;
    result.createdIds = [];
    return result;
  }

  private async assertMeetingExists(meetingId: string) {
    const m = await this.prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!m) throw new NotFoundException('Reunión no encontrada');
  }

  private async assertTopicInMeeting(meetingId: string, topicId: string) {
    const t = await this.prisma.agendaTopic.findFirst({
      where: { id: topicId, meetingId },
    });
    if (!t) throw new NotFoundException('Tema no encontrado');
  }

  /**
   * Resuelve a quién se le atribuye la transcripción. Si la secretaría/RDR
   * indica un `speakerName` (habla en nombre de un invitado sin cuenta), la
   * transcripción se guarda bajo ese nombre y sin userId. En cualquier otro
   * caso se atribuye al usuario que realmente sube el audio/texto.
   */
  private resolveTranscriptionAuthor(
    actorId: string,
    actorName: string,
    actorRole: Role | undefined,
    speakerName: string | undefined,
  ): { userId: string | null; userName: string } {
    const onBehalf = speakerName?.trim();
    const canSpeakOnBehalf = actorRole === Role.SECRETARY || actorRole === Role.RDR;
    if (onBehalf && canSpeakOnBehalf) {
      return { userId: null, userName: onBehalf.slice(0, 120) };
    }
    return { userId: actorId, userName: actorName };
  }

  async addTranscription(
    meetingId: string,
    topicId: string,
    userId: string,
    userName: string,
    text: string,
    actorRole?: Role,
    speakerName?: string,
  ) {
    const meeting = await this.prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) throw new NotFoundException('Reunión no encontrada');
    await this.assertTopicInMeeting(meetingId, topicId);

    const author = this.resolveTranscriptionAuthor(userId, userName, actorRole, speakerName);

    const transcription = await this.prisma.topicTranscription.create({
      data: {
        topicId,
        userId: author.userId,
        userName: author.userName,
        text: text.trim(),
      },
    });

    return transcription;
  }

  async transcribeAudio(
    meetingId: string,
    topicId: string,
    userId: string,
    userName: string,
    file: Express.Multer.File,
    actorRole?: Role,
    speakerName?: string,
  ) {
    const meeting = await this.prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) throw new NotFoundException('Reunión no encontrada');
    await this.assertTopicInMeeting(meetingId, topicId);

    // Validate meeting is LIVE
    if (meeting.status !== MeetingStatus.LIVE) {
      throw new BadRequestException('La reunión debe estar LIVE para transcribir audio');
    }

    if (!meeting.transcriptionEnabled) {
      throw new BadRequestException('La transcripción está deshabilitada para esta reunión');
    }

    // Validate active speaker
    if (meeting.currentSpeakerId !== userId) {
      throw new BadRequestException('Solo el orador activo puede enviar transcripciones de voz');
    }

    // Validate active topic
    if (meeting.currentTopicId !== topicId) {
      throw new BadRequestException('Solo se puede transcribir para el tema activo de la reunión');
    }

    // Apply sliding window rate limit
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute
    const maxRequests = 25; // max 25 audio chunks per minute
    let userRequests = this.rateLimits.get(userId) || [];
    userRequests = userRequests.filter((timestamp) => now - timestamp < windowMs);
    if (userRequests.length >= maxRequests) {
      throw new BadRequestException('Límite de transcripción excedido. Por favor intente más tarde.');
    }
    userRequests.push(now);
    this.rateLimits.set(userId, userRequests);

    if (!file || !file.buffer) {
      throw new BadRequestException('Archivo de audio requerido');
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      throw new BadRequestException('OpenAI API Key no configurada en el servidor');
    }

    try {
      const formData = new (globalThis as any).FormData();
      const blob = new (globalThis as any).Blob([file.buffer], { type: file.mimetype || 'audio/webm' });
      formData.append('file', blob, file.originalname || 'audio.webm');
      formData.append('model', 'whisper-1');
      formData.append('language', 'es');

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openaiKey}`,
        },
        body: formData,
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
      }

      const data = (await response.json()) as { text: string };
      const transcribedText = data.text?.trim() || '';

      if (!transcribedText) {
        return null;
      }

      // Save transcription to database (atribuida al invitado si la mesa habla en su nombre)
      const author = this.resolveTranscriptionAuthor(userId, userName, actorRole, speakerName);
      const transcription = await this.prisma.topicTranscription.create({
        data: {
          topicId,
          userId: author.userId,
          userName: author.userName,
          text: transcribedText,
        },
      });

      return transcription;
    } catch (error) {
      console.error('Error in Whisper transcription:', error);
      throw new BadRequestException(`Error al transcribir audio: ${(error as Error).message}`);
    }
  }
}
