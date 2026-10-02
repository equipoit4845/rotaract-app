import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(data: {
    meetingId?: string;
    clubId?: string;
    actorUserId?: string;
    action: string;
    entityType?: string;
    entityId?: string;
    metadata?: object;
  }) {
    return this.prisma.auditLog.create({
      data: {
        meetingId: data.meetingId,
        clubId: data.clubId,
        actorUserId: data.actorUserId,
        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId,
        metadataJson: data.metadata ? JSON.stringify(data.metadata) : null,
      },
    });
  }

  async findByEntity(entityType: string, entityId: string) {
    return this.prisma.auditLog.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByMeeting(meetingId: string) {
    return this.prisma.auditLog.findMany({
      where: { meetingId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
