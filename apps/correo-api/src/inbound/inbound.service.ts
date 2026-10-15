import { Inject, Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { MAIL_PROVIDER, type MailProvider } from '../mail-provider/mail-provider';
import { Prisma } from '../prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { fromApi, snippetOf, type InboundMail } from './inbound-mail';

const HOUR_MS = 60 * 60 * 1000;

/**
 * Received mail → the mailboxes it was addressed to (To and Cc), one copy per
 * mailbox, each in the right conversation:
 *
 * 1. `inReplyToEmailId`: ClickMail says it answers an email we sent → that
 *    email's thread;
 * 2. `In-Reply-To` / `References` match a Message-ID stored in the mailbox;
 * 3. otherwise a new thread. The subject never groups ("Re: Cuotas" from two
 *    clubs is not one conversation).
 *
 * Idempotent per (mailbox, ClickMail inbound id): the webhook, its retries
 * and the 15-minute catch-up can all deliver the same email.
 */
@Injectable()
export class InboundService {
  private readonly logger = new Logger(InboundService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(MAIL_PROVIDER) private readonly mail: MailProvider,
  ) {}

  /** Returns how many mailboxes got a new message. */
  async ingest(mail: InboundMail): Promise<number> {
    const recipients = [...new Set([...mail.to, ...mail.cc])];
    if (!recipients.length) return 0;
    const mailboxes = await this.prisma.mailbox.findMany({
      where: { address: { in: recipients }, status: { not: 'CLOSED' } },
    });
    let stored = 0;
    for (const mailbox of mailboxes) {
      try {
        if (await this.store(mailbox.id, mail)) stored++;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue;
        throw error;
      }
    }
    return stored;
  }

  private async store(mailboxId: string, mail: InboundMail): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const exists = await tx.message.findUnique({
        where: { mailboxId_clickmailInboundId: { mailboxId, clickmailInboundId: mail.inboundId } },
        select: { id: true },
      });
      if (exists) return false;

      const threadId = await this.threadFor(tx, mailboxId, mail);
      const spam = mail.spam === 'FAIL';
      const snippet = snippetOf(mail.text, mail.html);
      const thread = threadId
        ? await tx.thread.update({
            where: { id: threadId },
            data: {
              unreadCount: { increment: 1 },
              lastMessageAt: mail.receivedAt,
              lastDirection: 'IN',
              snippet,
              // A new reply brings an archived conversation back to the inbox.
              ...(spam ? {} : { folder: 'INBOX' }),
            },
          })
        : await tx.thread.create({
            data: {
              mailboxId,
              subject: mail.subject || '(sin asunto)',
              snippet,
              folder: spam ? 'SPAM' : 'INBOX',
              unreadCount: 1,
              lastMessageAt: mail.receivedAt,
              lastDirection: 'IN',
            },
          });

      const message = await tx.message.create({
        data: {
          threadId: thread.id,
          mailboxId,
          direction: 'IN',
          clickmailInboundId: mail.inboundId,
          messageIdHeader: mail.messageId,
          inReplyTo: mail.inReplyTo,
          references: mail.references,
          fromEmail: mail.from.email,
          fromName: mail.from.name,
          toEmails: mail.to,
          ccEmails: mail.cc,
          replyToEmails: mail.replyTo,
          subject: mail.subject || '(sin asunto)',
          text: mail.text,
          html: mail.html,
          status: 'RECEIVED',
          spfVerdict: mail.spf,
          dkimVerdict: mail.dkim,
          dmarcVerdict: mail.dmarc,
          spamVerdict: mail.spam,
          at: mail.receivedAt,
          attachments: {
            create: mail.attachments.map((a) => ({
              clickmailAttachmentId: a.id,
              filename: a.filename,
              contentType: a.contentType,
              contentId: a.contentId,
              sizeBytes: a.sizeBytes,
              stored: a.stored,
            })),
          },
        },
      });
      await this.audit.record(
        'message.received',
        { mailboxId, messageId: message.id, meta: { threadId: thread.id, attachments: mail.attachments.length, spam } },
        tx,
      );
      return true;
    });
  }

  private async threadFor(tx: Prisma.TransactionClient, mailboxId: string, mail: InboundMail) {
    if (mail.inReplyToEmailId) {
      const sent = await tx.message.findFirst({
        where: { mailboxId, clickmailEmailId: mail.inReplyToEmailId },
        select: { threadId: true },
      });
      if (sent) return sent.threadId;
    }
    const ids = [mail.inReplyTo, ...mail.references].filter((v): v is string => !!v);
    if (ids.length) {
      const related = await tx.message.findFirst({
        where: { mailboxId, messageIdHeader: { in: ids } },
        orderBy: { at: 'desc' },
        select: { threadId: true },
      });
      if (related) return related.threadId;
    }
    return null;
  }

  /**
   * Catch-up for lost webhooks: every open mailbox asks ClickMail for what
   * arrived since its newest stored message (an hour of overlap, at most
   * since the mailbox exists) and imports what is missing.
   */
  async backfill(): Promise<number> {
    if (!this.mail.configured) return 0;
    const mailboxes = await this.prisma.mailbox.findMany({ where: { status: { not: 'CLOSED' } } });
    let imported = 0;
    for (const mailbox of mailboxes) {
      try {
        const newest = await this.prisma.message.findFirst({
          where: { mailboxId: mailbox.id, direction: 'IN' },
          orderBy: { at: 'desc' },
          select: { at: true },
        });
        const dateFrom = new Date(
          Math.max(mailbox.createdAt.getTime() - HOUR_MS, (newest?.at.getTime() ?? 0) - HOUR_MS),
        );
        for (let page = 1; ; page++) {
          const { items, pages } = await this.mail.listInbound({ to: mailbox.address, dateFrom, page });
          for (const summary of items) {
            const known = await this.prisma.message.findUnique({
              where: { mailboxId_clickmailInboundId: { mailboxId: mailbox.id, clickmailInboundId: summary.id } },
              select: { id: true },
            });
            if (known) continue;
            imported += await this.ingest(fromApi(await this.mail.getInbound(summary.id)));
          }
          if (page >= pages || !items.length) break;
        }
      } catch (error) {
        this.logger.warn(`backfill failed for mailbox ${mailbox.id}: ${error instanceof Error ? error.name : 'error'}`);
      }
    }
    return imported;
  }
}
