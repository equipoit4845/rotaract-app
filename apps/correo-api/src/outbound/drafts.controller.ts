import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { MailboxAccessService } from '../inbox/mailbox-access.service';
import { PrismaService } from '../prisma/prisma.service';

const ID = /^[A-Za-z0-9_-]{16,80}$/;
const list = (v: unknown) =>
  Array.isArray(v)
    ? v
        .filter((x): x is string => typeof x === 'string')
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 50)
    : [];
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

/**
 * Drafts: saved by the composer every few seconds while typing, per person
 * and mailbox (a draft is never shared, not even on a role alias). The id is
 * made by the browser, so the first save is an upsert like any other.
 * Contacts: who the mailbox already wrote to or heard from, for suggestions.
 */
@Controller()
@UseGuards(AuthGuard('jwt'))
export class DraftsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MailboxAccessService,
  ) {}

  /** `GET /mailboxes/:id/drafts`: the person's drafts there, newest first. */
  @Get('mailboxes/:id/drafts')
  async drafts(@CurrentUser() user: CurrentUserPayload, @Param('id') mailboxId: string) {
    await this.access.open(user.personId, mailboxId);
    const drafts = await this.prisma.draft.findMany({
      where: { mailboxId, personId: user.personId },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      include: { thread: { select: { subject: true } } },
    });
    return drafts.map((d) => ({
      id: d.id,
      threadId: d.threadId,
      replyAll: d.replyAll,
      to: d.toEmails,
      cc: d.ccEmails,
      bcc: d.bccEmails,
      subject: d.threadId ? (d.thread?.subject ?? d.subject) : d.subject,
      text: d.text,
      updatedAt: d.updatedAt,
    }));
  }

  /** `PUT /drafts/:id` `{ mailboxId, threadId?, replyAll?, to, cc, bcc, subject, text }`. */
  @Put('drafts/:id')
  async save(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    if (!ID.test(id)) throw new BadRequestException('Borrador inválido.');
    const mailboxId = typeof body?.mailboxId === 'string' ? body.mailboxId : '';
    const mailbox = await this.access.open(user.personId, mailboxId);
    if (mailbox.status !== 'ACTIVE') throw new ForbiddenException('Esta casilla está en solo lectura.');
    const threadId = typeof body.threadId === 'string' ? body.threadId : null;
    if (threadId) {
      const thread = await this.prisma.thread.findUnique({ where: { id: threadId }, select: { mailboxId: true } });
      if (thread?.mailboxId !== mailboxId) throw new NotFoundException('No encontramos esa conversación.');
    }
    const existing = await this.prisma.draft.findUnique({ where: { id } });
    if (existing && (existing.personId !== user.personId || existing.mailboxId !== mailboxId)) {
      throw new NotFoundException('No encontramos ese borrador.');
    }
    const data = {
      threadId,
      replyAll: body.replyAll === true,
      toEmails: list(body.to),
      ccEmails: list(body.cc),
      bccEmails: list(body.bcc),
      subject: text(body.subject, 500),
      text: text(body.text, 200_000),
    };
    const draft = await this.prisma.draft.upsert({
      where: { id },
      create: { id, mailboxId, personId: user.personId, ...data },
      update: data,
    });
    return { id: draft.id, updatedAt: draft.updatedAt };
  }

  /** `DELETE /drafts/:id`: discarded, or sent. */
  @Delete('drafts/:id')
  @HttpCode(204)
  async remove(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    await this.prisma.draft.deleteMany({ where: { id, personId: user.personId } });
  }

  /**
   * `GET /mailboxes/:id/contacts?q=`: up to 8 addresses this mailbox wrote to
   * or got mail from, matching `q`, most recent first.
   */
  @Get('mailboxes/:id/contacts')
  async contacts(@CurrentUser() user: CurrentUserPayload, @Param('id') mailboxId: string, @Query('q') q = '') {
    const mailbox = await this.access.open(user.personId, mailboxId);
    const needle = q.trim().toLowerCase().slice(0, 100);
    if (!needle) return [];
    const rows = await this.prisma.$queryRaw<Array<{ email: string; name: string | null }>>`
      SELECT email, max(name) AS name FROM (
        SELECT "fromEmail" AS email, "fromName" AS name, "at" FROM "Message"
          WHERE "mailboxId" = ${mailboxId} AND direction = 'IN'
        UNION ALL
        SELECT unnest("toEmails" || "ccEmails") AS email, NULL AS name, "at" FROM "Message"
          WHERE "mailboxId" = ${mailboxId} AND direction = 'OUT'
      ) c
      WHERE (lower(email) LIKE ${`%${needle}%`} OR lower(coalesce(name, '')) LIKE ${`%${needle}%`})
        AND email <> ${mailbox.address}
      GROUP BY email
      ORDER BY max("at") DESC
      LIMIT 8`;
    return rows;
  }
}
