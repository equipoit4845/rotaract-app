import { Injectable } from '@nestjs/common';
import { Prisma } from '../prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Db = Pick<PrismaService, 'auditEvent'> | Prisma.TransactionClient;

/**
 * Who opened, sent, deleted or closed what. `meta` holds ids and states only:
 * never bodies, addresses, names or tokens.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    action: string,
    data: { actorPersonId?: string | null; mailboxId?: string | null; messageId?: string | null; meta?: object },
    db: Db = this.prisma,
  ): Promise<void> {
    await db.auditEvent.create({
      data: {
        action,
        actorPersonId: data.actorPersonId ?? null,
        mailboxId: data.mailboxId ?? null,
        messageId: data.messageId ?? null,
        meta: (data.meta as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
      },
    });
  }
}
