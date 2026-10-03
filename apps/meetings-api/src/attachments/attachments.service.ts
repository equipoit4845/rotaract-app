import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import * as path from 'path';
import { Readable } from 'stream';
import { Role } from '../auth/role';
import { DirectoryService } from '../directory/directory.service';
import { PrismaService } from '../prisma/prisma.service';
import { Attachment } from '../prisma/client';
import { FilesystemStorageAdapter } from './storage/filesystem.storage';
import { getEntityConfig } from './config/attachment-entity.config';

/**
 * Port of the legacy AttachmentsService, restricted to entityType "meeting"
 * (the only one the meetings module uses). Files live on the local
 * filesystem under MEETINGS_UPLOAD_DIR instead of R2.
 */
export type AttachmentEntityType = 'meeting';

export interface AttachmentUploadContext {
  clubId?: string;
  role?: Role;
  actorUserId?: string;
}

const storageBackendDefault = 'fs';

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 255);
}

@Injectable()
export class AttachmentsService {
  private readonly storage = new FilesystemStorageAdapter();

  constructor(
    private readonly prisma: PrismaService,
    private readonly directory: DirectoryService,
  ) {}

  async list(entityType: string, entityId: string): Promise<Attachment[]> {
    return this.prisma.attachment.findMany({
      where: { entityType, entityId },
      orderBy: { uploadedAt: 'desc' },
    });
  }

  async upload(
    entityType: AttachmentEntityType,
    entityId: string,
    file: Express.Multer.File,
    userId: string,
    context: AttachmentUploadContext,
  ) {
    if (!file || !file.originalname || !file.buffer) {
      throw new BadRequestException('Archivo requerido');
    }

    const config = getEntityConfig(entityType);
    if (!config) {
      throw new BadRequestException(`Tipo de entidad no soportado: ${entityType}`);
    }

    if (file.size > config.maxSizeBytes) {
      throw new BadRequestException(
        `Archivo demasiado grande (máx. ${Math.round(config.maxSizeBytes / 1024 / 1024)}MB)`,
      );
    }

    const mime = file.mimetype || '';
    if (!config.allowedMimes.includes(mime)) {
      throw new BadRequestException('Tipo de archivo no permitido');
    }

    await this.validateEntityAccess(entityType, entityId, userId, {
      ...context,
      actorUserId: userId,
    });

    const count = await this.prisma.attachment.count({
      where: { entityType, entityId },
    });
    if (count >= config.maxFiles) {
      throw new BadRequestException(`Máximo ${config.maxFiles} archivos por reunión`);
    }

    const ext = path.extname(file.originalname) || '.bin';
    const id = crypto.randomUUID();
    const storageKey = `rotaract/${entityType}/${entityId}/${id}${ext}`;
    const fileName = sanitizeFileName(file.originalname);

    await this.storage.upload({
      key: storageKey,
      body: file.buffer,
      contentType: file.mimetype || 'application/octet-stream',
    });

    const attachment = await this.prisma.attachment.create({
      data: {
        entityType,
        entityId,
        fileName,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storageKey,
        storageBackend: storageBackendDefault,
        uploadedById: userId,
      },
    });

    const auditClubId = await this.getEntityClubId(entityId);
    await this.prisma.auditLog.create({
      data: {
        clubId: auditClubId ?? undefined,
        actorUserId: userId,
        action: 'attachment.uploaded',
        entityType: 'Attachment',
        entityId: attachment.id,
        metadataJson: JSON.stringify({ entityType, entityId }),
      },
    });

    return attachment;
  }

  async getForDownload(id: string, userId: string, role?: Role) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id },
    });
    if (!attachment) throw new NotFoundException('Adjunto no encontrado');

    await this.requireAttachmentAccess(attachment.entityId, userId, role ?? Role.PARTICIPANT);

    const stream = await this.storage.getStream(attachment.storageKey);
    const buffer = await streamToBuffer(stream);
    return { buffer, attachment };
  }

  async delete(id: string, context: AttachmentUploadContext & { actorUserId?: string }) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id },
    });
    if (!attachment) throw new NotFoundException('Adjunto no encontrado');

    const config = getEntityConfig(attachment.entityType);
    if (!config) throw new ForbiddenException('Tipo de entidad no soportado');
    await this.requireMeetingUploadAccess(attachment.entityId, context);
    const meeting = await this.prisma.meeting.findUnique({ where: { id: attachment.entityId } });
    if (!meeting || !config.canDelete(meeting)) {
      throw new ForbiddenException('Solo se pueden eliminar adjuntos de reuniones en borrador');
    }

    try {
      await this.storage.delete(attachment.storageKey);
    } catch {
      // Idempotent: ignore if object missing
    }

    const auditClubId = await this.getEntityClubId(attachment.entityId);
    await this.prisma.auditLog.create({
      data: {
        clubId: auditClubId ?? undefined,
        actorUserId: context.actorUserId ?? attachment.uploadedById,
        action: 'attachment.deleted',
        entityType: 'Attachment',
        entityId: attachment.id,
        metadataJson: JSON.stringify({
          entityType: attachment.entityType,
          entityId: attachment.entityId,
        }),
      },
    });

    await this.prisma.attachment.delete({ where: { id } });
    return { success: true };
  }

  private async getEntityClubId(entityId: string): Promise<string | null> {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: entityId },
      select: { clubId: true },
    });
    return meeting?.clubId ?? null;
  }

  private async requireAttachmentAccess(entityId: string, userId: string, role: Role) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: entityId },
      select: { clubId: true },
    });
    if (!meeting) throw new ForbiddenException('Adjunto no encontrado');
    if (role === Role.SECRETARY || role === Role.PRESIDENT || role === Role.RDR) return;
    // Legacy RolesGuard lets SUPERADMIN everywhere; the service did not.
    if (role === Role.SUPERADMIN) return;
    if (!(await this.directory.isActiveMember(userId, meeting.clubId))) {
      throw new ForbiddenException('Sin acceso a este recurso');
    }
  }

  private async validateEntityAccess(
    entityType: AttachmentEntityType,
    entityId: string,
    userId: string,
    context: AttachmentUploadContext,
  ) {
    await this.requireMeetingUploadAccess(entityId, context);
    const meeting = await this.prisma.meeting.findUnique({ where: { id: entityId } });
    if (!meeting || meeting.status !== 'DRAFT') {
      throw new ForbiddenException('Solo se pueden agregar adjuntos a reuniones en borrador');
    }
  }

  private async requireMeetingUploadAccess(entityId: string, context: AttachmentUploadContext) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: entityId },
      select: { clubId: true },
    });
    if (!meeting) throw new ForbiddenException('Reunión no encontrada');
    if (context.role === Role.SECRETARY) return;
    if (context.clubId && meeting.clubId === context.clubId) return;
    if ((context.role === Role.PRESIDENT || context.role === Role.RDR) && context.actorUserId) {
      const presidentClubIds = await this.directory.getPresidentClubIds(context.actorUserId);
      if (presidentClubIds.includes(meeting.clubId)) return;
    }
    throw new ForbiddenException('Sin permiso para adjuntar a esta reunión');
  }
}
