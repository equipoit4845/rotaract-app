import { Injectable, NotFoundException } from '@nestjs/common';
import { AccessService } from '../kernel/access.service';
import type { Mailbox } from '../prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Which mailboxes a person may open: only with `correo.mailbox.use` from the
 * kernel, and only those assigned to them — a role alias while they hold the
 * position, their personal mailbox also while it is READ_ONLY.
 */
@Injectable()
export class MailboxAccessService {
  constructor(
    private readonly access: AccessService,
    private readonly prisma: PrismaService,
  ) {}

  async openable(personId: string): Promise<{ canUse: boolean; canManage: boolean; mailboxes: Mailbox[] }> {
    const access = await this.access.forPerson(personId);
    if (!access.canUse) return { ...access, mailboxes: [] };
    const assignments = await this.prisma.mailboxAssignment.findMany({
      where: {
        personId,
        mailbox: { status: { not: 'CLOSED' } },
        OR: [{ status: 'ACTIVE' }, { mailbox: { kind: 'PERSONAL', status: 'READ_ONLY' } }],
      },
      include: { mailbox: true },
      orderBy: [{ mailbox: { kind: 'asc' } }, { startsAt: 'desc' }],
    });
    const seen = new Set<string>();
    const mailboxes = assignments.map((a) => a.mailbox).filter((m) => !seen.has(m.id) && seen.add(m.id));
    return { ...access, mailboxes };
  }

  /** The mailbox if the person may open it; 404 otherwise (never reveals it exists). */
  async open(personId: string, mailboxId: string): Promise<Mailbox> {
    const { mailboxes } = await this.openable(personId);
    const mailbox = mailboxes.find((m) => m.id === mailboxId);
    if (!mailbox) throw new NotFoundException('No encontramos esa casilla.');
    return mailbox;
  }
}
