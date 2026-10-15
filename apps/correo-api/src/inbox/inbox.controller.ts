import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuditService } from '../audit/audit.service';
import { htmlToText } from '../inbound/inbound-mail';
import { normalizeCid, resolveInlineImages, sanitizeEmailHtml } from '../inbound/sanitize-email';
import { parseSearch } from './search';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { MAIL_PROVIDER, type MailProvider } from '../mail-provider/mail-provider';
import type { Folder } from '../prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailboxAccessService } from './mailbox-access.service';

const FOLDERS: Folder[] = ['INBOX', 'ARCHIVE', 'TRASH', 'SPAM'];
/** Not a stored folder: the conversations with at least one message we sent. */
const SENT = 'SENT';
const PAGE_SIZE = 30;
const VISTAS = ['no-leidos', 'por-responder', 'con-adjuntos'];
const failed = (v: string | null) => v === 'FAIL';

/** Reading: conversations of a mailbox, one conversation, an attachment. */
@Controller()
@UseGuards(AuthGuard('jwt'))
export class InboxController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MailboxAccessService,
    private readonly audit: AuditService,
    @Inject(MAIL_PROVIDER) private readonly mail: MailProvider,
  ) {}

  /**
   * `GET /mailboxes/:id/threads?folder=INBOX&vista=&q=&before=<ISO>`: newest
   * first, 30 a page. `vista`: no-leidos, por-responder (the newest message
   * is from outside), con-adjuntos. `q` searches every folder but the
   * Papelera (see `parseSearch`).
   */
  @Get('mailboxes/:id/threads')
  async threads(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') mailboxId: string,
    @Query('folder') folder = 'INBOX',
    @Query('before') before?: string,
    @Query('vista') vista?: string,
    @Query('q') q?: string,
  ) {
    if (folder !== SENT && !FOLDERS.includes(folder as Folder)) throw new BadRequestException('Carpeta desconocida.');
    if (vista && !VISTAS.includes(vista)) throw new BadRequestException('Vista desconocida.');
    const beforeDate = before ? new Date(before) : null;
    if (beforeDate && Number.isNaN(beforeDate.getTime())) throw new BadRequestException('Fecha inválida.');
    await this.access.open(user.personId, mailboxId);
    const search = q?.trim() ? parseSearch(q.slice(0, 200)) : null;
    const threads = await this.prisma.thread.findMany({
      where: {
        mailboxId,
        ...(search
          ? { folder: { not: 'TRASH' }, AND: search }
          : folder === SENT
            ? { messages: { some: { direction: 'OUT' } }, folder: { not: 'TRASH' } }
            : folder === 'INBOX'
              ? // Like Gmail: a conversation only we wrote in lives in Sent until someone answers.
                { folder: 'INBOX', messages: { some: { direction: 'IN' } } }
              : { folder: folder as Folder }),
        ...(vista === 'no-leidos' ? { unreadCount: { gt: 0 } } : {}),
        ...(vista === 'por-responder' ? { lastDirection: 'IN' as const } : {}),
        ...(vista === 'con-adjuntos' ? { messages: { some: { attachments: { some: {} } } } } : {}),
        ...(beforeDate ? { lastMessageAt: { lt: beforeDate } } : {}),
      },
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
      take: PAGE_SIZE + 1,
      include: {
        messages: {
          orderBy: { at: 'desc' },
          take: 1,
          select: { fromEmail: true, fromName: true, toEmails: true, direction: true },
        },
        _count: { select: { messages: true } },
      },
    });
    const page = threads.slice(0, PAGE_SIZE);
    // Who wrote last from outside (shown in every view but Sent).
    const lastIn = new Map(
      (
        await this.prisma.message.findMany({
          where: { threadId: { in: page.map((t) => t.id) }, direction: 'IN' },
          orderBy: { at: 'desc' },
          select: { threadId: true, fromEmail: true, fromName: true },
          distinct: ['threadId'],
        })
      ).map((m) => [m.threadId, { email: m.fromEmail, name: m.fromName }]),
    );
    const withAttachments = new Set(
      (
        await this.prisma.message.findMany({
          where: { threadId: { in: page.map((t) => t.id) }, attachments: { some: {} } },
          select: { threadId: true },
          distinct: ['threadId'],
        })
      ).map((m) => m.threadId),
    );
    return {
      items: page.map((t) => ({
        id: t.id,
        subject: t.subject,
        snippet: t.snippet,
        unread: t.unreadCount > 0,
        lastMessageAt: t.lastMessageAt,
        messageCount: t._count.messages,
        from: t.messages[0] ? { email: t.messages[0].fromEmail, name: t.messages[0].fromName } : null,
        // Who the newest message went to (shown instead of the sender in Sent).
        to: t.messages[0]?.toEmails ?? [],
        lastDirection: t.messages[0]?.direction ?? null,
        lastFrom: lastIn.get(t.id) ?? null,
        folder: t.folder,
        hasAttachments: withAttachments.has(t.id),
      })),
      nextBefore: threads.length > PAGE_SIZE ? page[page.length - 1].lastMessageAt : null,
    };
  }

  /** `GET /threads/:id`: the conversation, oldest first. Opening it marks it read. */
  @Get('threads/:id')
  async thread(@CurrentUser() user: CurrentUserPayload, @Param('id') threadId: string) {
    const thread = await this.prisma.thread.findUnique({ where: { id: threadId } });
    if (!thread) throw new NotFoundException('No encontramos esa conversación.');
    await this.access.open(user.personId, thread.mailboxId);
    const messages = await this.prisma.message.findMany({
      where: { threadId },
      orderBy: { at: 'asc' },
      include: { attachments: { orderBy: { createdAt: 'asc' } } },
    });
    if (thread.unreadCount > 0) {
      await this.prisma.$transaction([
        this.prisma.message.updateMany({ where: { threadId, readAt: null }, data: { readAt: new Date() } }),
        this.prisma.thread.update({ where: { id: threadId }, data: { unreadCount: 0 } }),
      ]);
    }
    const draft = await this.prisma.draft.findFirst({
      where: { threadId, personId: user.personId },
      orderBy: { updatedAt: 'desc' },
    });
    await this.audit.record('thread.opened', {
      actorPersonId: user.personId,
      mailboxId: thread.mailboxId,
      meta: { threadId },
    });
    // Sanitized HTML per message; inline images (cid:) of received ones get
    // their short-lived links, and are not listed again as attachments.
    const views = new Map<
      string,
      { html: string | null; remoteImages: boolean; origins: string[]; inlineCids: Set<string> }
    >();
    for (const m of messages) {
      const safe = sanitizeEmailHtml(m.html);
      const inlineCids = new Set([...(safe?.html.matchAll(/ data-cd-cid="([^"]*)"/g) ?? [])].map((x) => x[1]));
      const urls = new Map<string, string>();
      if (safe && inlineCids.size && m.direction === 'IN' && m.clickmailInboundId) {
        for (const a of m.attachments) {
          const cid = a.contentId ? normalizeCid(a.contentId) : null;
          if (!cid || !inlineCids.has(cid) || !a.stored || !a.clickmailAttachmentId) continue;
          try {
            urls.set(cid, await this.mail.attachmentUrl(m.clickmailInboundId, a.clickmailAttachmentId));
          } catch {
            // Shown without that image.
          }
        }
      }
      views.set(m.id, {
        html: safe ? resolveInlineImages(safe.html, urls) : null,
        remoteImages: safe?.remoteImages ?? false,
        origins: [...new Set([...urls.values()].map((u) => new URL(u).origin))],
        inlineCids: new Set([...inlineCids].filter((c) => urls.has(c))),
      });
    }
    return {
      id: thread.id,
      mailboxId: thread.mailboxId,
      subject: thread.subject,
      folder: thread.folder,
      // The person's unsent reply here, if they left one.
      draft: draft
        ? {
            id: draft.id,
            replyAll: draft.replyAll,
            cc: draft.ccEmails,
            bcc: draft.bccEmails,
            text: draft.text,
            html: draft.html,
          }
        : null,
      messages: messages.map((m) => {
        const view = views.get(m.id)!;
        return {
          id: m.id,
          direction: m.direction,
          from: { email: m.fromEmail, name: m.fromName },
          to: m.toEmails,
          cc: m.ccEmails,
          replyTo: m.replyToEmails,
          subject: m.subject,
          body: m.text ?? htmlToText(m.html),
          // Sanitized here (src/inbound/sanitize-email.ts); the reader shows it in a sandboxed iframe.
          html: view.html,
          remoteImages: view.remoteImages,
          /** Where inline images load from (the reader's CSP allows them). */
          imageOrigins: view.origins,
          at: m.at,
          status: m.status,
          statusDetail: m.statusDetail,
          bcc: m.direction === 'OUT' ? m.bccEmails : [],
          // SPF, DKIM or DMARC failed: the sender may not be who it claims.
          suspicious: failed(m.spfVerdict) || failed(m.dkimVerdict) || failed(m.dmarcVerdict),
          spam: failed(m.spamVerdict),
          attachments: m.attachments
            .filter((a) => !(a.contentId && view.inlineCids.has(normalizeCid(a.contentId))))
            .map((a) => ({
              id: a.id,
              filename: a.filename,
              contentType: a.contentType,
              sizeBytes: a.sizeBytes,
              available: a.stored && !!a.clickmailAttachmentId,
            })),
        };
      }),
    };
  }

  /**
   * `POST /threads/actions` `{ threadIds, folder?, read? }`: move conversations
   * (archive, trash, spam, back to the inbox) and/or mark them read or unread.
   * Answers each one's previous state so the screen can undo. A READ_ONLY
   * mailbox can only be marked read or unread.
   */
  @Post('threads/actions')
  @HttpCode(200)
  async actions(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { threadIds?: unknown; folder?: unknown; read?: unknown },
  ) {
    const ids = Array.isArray(body?.threadIds)
      ? [...new Set(body.threadIds.filter((x): x is string => typeof x === 'string'))]
      : [];
    if (!ids.length || ids.length > 100) throw new BadRequestException('Elegí entre 1 y 100 conversaciones.');
    const folder = body.folder === undefined ? undefined : (body.folder as Folder);
    if (folder !== undefined && !FOLDERS.includes(folder)) throw new BadRequestException('Carpeta desconocida.');
    const read = body.read === undefined ? undefined : body.read === true;
    if (folder === undefined && read === undefined) throw new BadRequestException('No hay nada que cambiar.');

    const threads = await this.prisma.thread.findMany({ where: { id: { in: ids } } });
    if (threads.length !== ids.length) throw new NotFoundException('No encontramos alguna de esas conversaciones.');
    const { mailboxes } = await this.access.openable(user.personId);
    const open = new Map(mailboxes.map((m) => [m.id, m]));
    for (const t of threads) {
      const mailbox = open.get(t.mailboxId);
      if (!mailbox) throw new NotFoundException('No encontramos alguna de esas conversaciones.');
      if (folder !== undefined && mailbox.status !== 'ACTIVE') {
        throw new ForbiddenException('Esta casilla está en solo lectura: no se pueden mover conversaciones.');
      }
    }

    const previous = threads.map((t) => ({ id: t.id, folder: t.folder, read: t.unreadCount === 0 }));
    await this.prisma.$transaction(async (tx) => {
      if (folder !== undefined) {
        await tx.thread.updateMany({
          where: { id: { in: ids } },
          data: { folder, trashedAt: folder === 'TRASH' ? new Date() : null },
        });
      }
      if (read === true) {
        await tx.thread.updateMany({ where: { id: { in: ids } }, data: { unreadCount: 0 } });
        await tx.message.updateMany({ where: { threadId: { in: ids }, readAt: null }, data: { readAt: new Date() } });
      } else if (read === false) {
        // Unread = the newest received message is unread again.
        for (const id of ids) {
          const last = await tx.message.findFirst({
            where: { threadId: id, direction: 'IN' },
            orderBy: { at: 'desc' },
          });
          if (last) await tx.message.update({ where: { id: last.id }, data: { readAt: null } });
          await tx.thread.update({ where: { id }, data: { unreadCount: last ? 1 : 0 } });
        }
      }
      for (const t of threads) {
        await this.audit.record(
          'thread.updated',
          { actorPersonId: user.personId, mailboxId: t.mailboxId, meta: { threadId: t.id, folder, read } },
          tx,
        );
      }
    });
    return { previous };
  }

  /**
   * `GET /messages/:id/attachments/:attachmentId` → `{ url, filename }`: a
   * short-lived link to the file. JSON rather than a redirect because the
   * browser authenticates with a Bearer header a plain link cannot carry.
   */
  @Get('messages/:id/attachments/:attachmentId')
  async attachment(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') messageId: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    const attachment = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, messageId },
      include: { message: { select: { mailboxId: true, clickmailInboundId: true } } },
    });
    if (!attachment) throw new NotFoundException('No encontramos ese adjunto.');
    await this.access.open(user.personId, attachment.message.mailboxId);
    if (!attachment.stored || !attachment.clickmailAttachmentId || !attachment.message.clickmailInboundId) {
      throw new NotFoundException('Este adjunto no está disponible: superaba el tamaño que se guarda.');
    }
    const url = await this.mail.attachmentUrl(attachment.message.clickmailInboundId, attachment.clickmailAttachmentId);
    await this.audit.record('attachment.downloaded', {
      actorPersonId: user.personId,
      mailboxId: attachment.message.mailboxId,
      messageId,
      meta: { attachmentId },
    });
    return { url, filename: attachment.filename };
  }
}
