import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

export const TRASH_DAYS = 30;

/**
 * Conversations in the Papelera for more than 30 days are deleted from this
 * app (messages, attachments' records and drafts go with them). ClickMail
 * keeps its own copy of what was received or sent.
 */
@Injectable()
export class TrashService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async empty(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - TRASH_DAYS * 24 * 60 * 60 * 1000);
    const due = await this.prisma.thread.findMany({
      where: { folder: 'TRASH', trashedAt: { lte: cutoff } },
      select: { id: true, mailboxId: true },
      take: 500,
    });
    if (!due.length) return 0;
    await this.prisma.$transaction(async (tx) => {
      await tx.thread.deleteMany({ where: { id: { in: due.map((t) => t.id) } } });
      for (const t of due) {
        await this.audit.record(
          'thread.purged',
          { mailboxId: t.mailboxId, meta: { threadId: t.id, days: TRASH_DAYS } },
          tx,
        );
      }
    });
    return due.length;
  }
}
