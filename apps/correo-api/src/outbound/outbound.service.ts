import {
  BadRequestException,
  BadGatewayException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { EmailEventData } from '@clickmail/sdk';
import { AuditService } from '../audit/audit.service';
import { snippetOf } from '../inbound/inbound-mail';
import { MailboxAccessService } from '../inbox/mailbox-access.service';
import { MAIL_PROVIDER, type MailProvider, type OutgoingAttachment } from '../mail-provider/mail-provider';
import { Prisma, type Mailbox, type MessageStatus } from '../prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** ClickMail: up to 50 recipients, 10 files and about 28 MB per email. */
export const MAX_RECIPIENTS = 50;
export const MAX_ATTACHMENTS = 10;
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
/** Types SES refuses; checked here so the person gets the message before uploading. */
const BLOCKED_EXTENSIONS = new Set([
  'ade',
  'adp',
  'app',
  'asp',
  'bas',
  'bat',
  'cer',
  'chm',
  'cmd',
  'com',
  'cpl',
  'crt',
  'csh',
  'der',
  'exe',
  'fxp',
  'gadget',
  'hlp',
  'hta',
  'inf',
  'ins',
  'isp',
  'its',
  'js',
  'jse',
  'ksh',
  'lib',
  'lnk',
  'mad',
  'maf',
  'mag',
  'mam',
  'maq',
  'mar',
  'mas',
  'mat',
  'mau',
  'mav',
  'maw',
  'mda',
  'mdb',
  'mde',
  'mdt',
  'mdw',
  'mdz',
  'msc',
  'msh',
  'msh1',
  'msh2',
  'mshxml',
  'msh1xml',
  'msh2xml',
  'msi',
  'msp',
  'mst',
  'ops',
  'pcd',
  'pif',
  'plg',
  'prf',
  'prg',
  'reg',
  'scf',
  'scr',
  'sct',
  'shb',
  'shs',
  'sys',
  'ps1',
  'ps1xml',
  'ps2',
  'ps2xml',
  'psc1',
  'psc2',
  'tmp',
  'url',
  'vb',
  'vbe',
  'vbs',
  'vps',
  'vsmacros',
  'vss',
  'vst',
  'vsw',
  'vxd',
  'ws',
  'wsc',
  'wsf',
  'wsh',
  'xnk',
]);
const EMAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;

/** Delivery states only move forward; a bounce or a failure is final. */
const RANK: Record<MessageStatus, number> = { RECEIVED: 0, QUEUED: 1, SENT: 2, DELIVERED: 3, BOUNCED: 4, FAILED: 4 };

export type ComposeInput = {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text: string;
  idempotencyKey: string;
};

export type ReplyInput = {
  replyAll: boolean;
  cc?: string[];
  bcc?: string[];
  text: string;
  /** The message answered; default: the newest one of the thread. */
  messageId?: string;
  idempotencyKey: string;
};

export type UploadedFile = { originalname: string; mimetype: string; size: number; buffer: Buffer };

/** "Hola\n\nChau" → escaped HTML with paragraphs and line breaks. */
export function textToHtml(text: string): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('\n');
  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5">${paragraphs}</body></html>`;
}

export function normalizeRecipients(list: string[] | undefined, field: string): string[] {
  const out: string[] = [];
  for (const raw of list ?? []) {
    for (const part of raw.split(/[,;\s]+/)) {
      const email = part.trim().toLowerCase();
      if (!email) continue;
      if (!EMAIL.test(email)) throw new BadRequestException(`«${email}» no es una dirección válida (${field}).`);
      if (!out.includes(email)) out.push(email);
    }
  }
  return out;
}

export function checkAttachments(files: UploadedFile[]): OutgoingAttachment[] {
  if (files.length > MAX_ATTACHMENTS)
    throw new BadRequestException(`Podés adjuntar hasta ${MAX_ATTACHMENTS} archivos.`);
  const total = files.reduce((sum, f) => sum + f.size, 0);
  if (total > MAX_ATTACHMENT_BYTES) throw new BadRequestException('Los adjuntos pasan de 25 MB en total.');
  for (const f of files) {
    const ext = f.originalname.toLowerCase().split('.').pop() ?? '';
    if (BLOCKED_EXTENSIONS.has(ext)) {
      throw new BadRequestException(`No se pueden enviar archivos .${ext} (${f.originalname}).`);
    }
  }
  return files.map((f) => ({ filename: f.originalname, content: f.buffer, contentType: f.mimetype || undefined }));
}

const reSubject = (subject: string) => (/^\s*re:/i.test(subject) ? subject : `Re: ${subject}`);

/**
 * Sending: a new email from a mailbox, or a reply in a conversation. Only an
 * ACTIVE mailbox sends (READ_ONLY ones are past their mandate; ClickMail also
 * refuses their disabled sender). The message is stored as QUEUED and moves
 * forward with ClickMail's delivery webhooks.
 */
@Injectable()
export class OutboundService {
  private readonly logger = new Logger(OutboundService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MailboxAccessService,
    private readonly audit: AuditService,
    @Inject(MAIL_PROVIDER) private readonly mail: MailProvider,
  ) {}

  private async sendable(personId: string, mailboxId: string): Promise<Mailbox> {
    const mailbox = await this.access.open(personId, mailboxId);
    if (mailbox.status !== 'ACTIVE') {
      throw new ForbiddenException('Esta casilla está en solo lectura: tu mandato terminó y ya no puede enviar.');
    }
    return mailbox;
  }

  private from(mailbox: Mailbox) {
    return `${mailbox.displayName.replace(/[<>"]/g, '')} <${mailbox.address}>`;
  }

  async compose(personId: string, mailboxId: string, input: ComposeInput, files: UploadedFile[]) {
    const mailbox = await this.sendable(personId, mailboxId);
    const to = normalizeRecipients(input.to, 'Para');
    const cc = normalizeRecipients(input.cc, 'CC');
    const bcc = normalizeRecipients(input.bcc, 'CCO');
    if (!to.length) throw new BadRequestException('Falta al menos un destinatario en «Para».');
    if (to.length + cc.length + bcc.length > MAX_RECIPIENTS) {
      throw new BadRequestException(`Podés escribirle a hasta ${MAX_RECIPIENTS} direcciones por mail.`);
    }
    const subject = input.subject.trim() || '(sin asunto)';
    const attachments = checkAttachments(files);
    const html = textToHtml(input.text);

    const emailId = await this.call(() =>
      this.mail.send({
        from: this.from(mailbox),
        to,
        cc,
        bcc,
        subject,
        text: input.text,
        html,
        attachments,
        idempotencyKey: input.idempotencyKey,
      }),
    );
    return this.record(personId, mailbox, null, {
      emailId,
      to,
      cc,
      bcc,
      subject,
      text: input.text,
      html,
      files,
      kind: 'compose',
    });
  }

  async reply(personId: string, threadId: string, input: ReplyInput, files: UploadedFile[]) {
    const thread = await this.prisma.thread.findUnique({ where: { id: threadId } });
    if (!thread) throw new NotFoundException('No encontramos esa conversación.');
    const mailbox = await this.sendable(personId, thread.mailboxId);
    const target = await this.prisma.message.findFirst({
      where: { threadId, ...(input.messageId ? { id: input.messageId } : {}) },
      orderBy: { at: 'desc' },
    });
    if (!target) throw new NotFoundException('No encontramos el mensaje a responder.');

    const cc = normalizeRecipients(input.cc, 'CC');
    const bcc = normalizeRecipients(input.bcc, 'CCO');
    const attachments = checkAttachments(files);
    const html = textToHtml(input.text);
    const subject = reSubject(thread.subject);
    const ours = new Set((await this.prisma.mailbox.findMany({ select: { address: true } })).map((m) => m.address));

    let to: string[];
    let allCc = cc;
    let emailId: string;
    if (target.direction === 'IN' && target.clickmailInboundId) {
      // ClickMail picks the recipients (Reply-To or From, plus To/Cc on reply all);
      // the same rule is applied here only to record who it went to.
      to = target.replyToEmails.length ? target.replyToEmails : [target.fromEmail];
      if (input.replyAll) {
        const others = [...target.toEmails, ...target.ccEmails].filter((e) => !ours.has(e) && !to.includes(e));
        allCc = [...new Set([...others, ...cc])];
      }
      emailId = await this.call(() =>
        this.mail.reply(target.clickmailInboundId!, {
          from: this.from(mailbox),
          subject,
          text: input.text,
          html,
          replyAll: input.replyAll,
          cc,
          bcc,
          attachments,
          idempotencyKey: input.idempotencyKey,
        }),
      );
    } else {
      // Following up on our own email: same recipients, threaded on it.
      to = target.toEmails.filter((e) => !ours.has(e));
      if (input.replyAll) allCc = [...new Set([...target.ccEmails.filter((e) => !ours.has(e)), ...cc])];
      if (!to.length) throw new BadRequestException('Ese mensaje no tiene a quién responder.');
      emailId = await this.call(() =>
        this.mail.send({
          from: this.from(mailbox),
          to,
          cc: allCc,
          bcc,
          subject,
          text: input.text,
          html,
          attachments,
          inReplyToEmailId: target.clickmailEmailId ?? undefined,
          idempotencyKey: input.idempotencyKey,
        }),
      );
    }
    if (to.length + allCc.length + bcc.length > MAX_RECIPIENTS) {
      this.logger.warn(`reply ${emailId} went to more than ${MAX_RECIPIENTS} recipients`);
    }
    return this.record(personId, mailbox, thread.id, {
      emailId,
      to,
      cc: allCc,
      bcc,
      subject,
      text: input.text,
      html,
      files,
      kind: input.replyAll ? 'reply_all' : 'reply',
      inReplyTo: target.messageIdHeader,
      references: [...target.references, ...(target.messageIdHeader ? [target.messageIdHeader] : [])],
    });
  }

  private async record(
    personId: string,
    mailbox: Mailbox,
    threadId: string | null,
    m: {
      emailId: string;
      to: string[];
      cc: string[];
      bcc: string[];
      subject: string;
      text: string;
      html: string;
      files: UploadedFile[];
      kind: string;
      inReplyTo?: string | null;
      references?: string[];
    },
  ) {
    // The same idempotency key returns the email already queued: no second row.
    const existing = await this.prisma.message.findUnique({ where: { clickmailEmailId: m.emailId } });
    if (existing) return { threadId: existing.threadId, messageId: existing.id };
    const now = new Date();
    try {
      return await this.prisma.$transaction(async (tx) => {
        const snippet = snippetOf(m.text, null);
        const thread = threadId
          ? await tx.thread.update({
              where: { id: threadId },
              data: { lastMessageAt: now, lastDirection: 'OUT', snippet, folder: 'INBOX', trashedAt: null },
            })
          : await tx.thread.create({
              data: { mailboxId: mailbox.id, subject: m.subject, snippet, lastMessageAt: now, lastDirection: 'OUT' },
            });
        const message = await tx.message.create({
          data: {
            threadId: thread.id,
            mailboxId: mailbox.id,
            direction: 'OUT',
            clickmailEmailId: m.emailId,
            inReplyTo: m.inReplyTo ?? null,
            references: m.references ?? [],
            fromEmail: mailbox.address,
            fromName: mailbox.displayName,
            toEmails: m.to,
            ccEmails: m.cc,
            bccEmails: m.bcc,
            subject: m.subject,
            text: m.text,
            html: m.html,
            status: 'QUEUED',
            sentByPersonId: personId,
            readAt: now,
            at: now,
            attachments: {
              create: m.files.map((f) => ({
                filename: f.originalname,
                contentType: f.mimetype || null,
                sizeBytes: f.size,
                // Kept by ClickMail with the sent email, not downloadable from here yet.
                stored: false,
              })),
            },
          },
        });
        await this.audit.record(
          'message.sent',
          {
            actorPersonId: personId,
            mailboxId: mailbox.id,
            messageId: message.id,
            meta: {
              threadId: thread.id,
              kind: m.kind,
              recipients: m.to.length + m.cc.length + m.bcc.length,
              attachments: m.files.length,
            },
          },
          tx,
        );
        return { threadId: thread.id, messageId: message.id };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const again = await this.prisma.message.findUniqueOrThrow({ where: { clickmailEmailId: m.emailId } });
        return { threadId: again.threadId, messageId: again.id };
      }
      throw error;
    }
  }

  /** ClickMail errors in words the person can act on. */
  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      const code = (error as { code?: string })?.code;
      switch (code) {
        case 'SENDER_DISABLED':
          throw new ForbiddenException('Esta casilla ya no puede enviar: tu mandato terminó.');
        case 'ATTACHMENT_TYPE_NOT_ALLOWED':
          throw new UnprocessableEntityException('Uno de los adjuntos es de un tipo que no se puede enviar.');
        case 'ATTACHMENTS_TOO_LARGE':
          throw new UnprocessableEntityException('Los adjuntos son demasiado grandes para un mail.');
        case 'EMAIL_SUPPRESSED':
          throw new UnprocessableEntityException(
            'Una de las direcciones está bloqueada porque antes rebotó o se quejó de spam. Revisala o sacala.',
          );
        case 'RATE_LIMIT_EXCEEDED':
        case 'QUOTA_EXCEEDED':
          throw new HttpException(
            'Se enviaron muchos mails seguidos. Probá de nuevo en unos minutos.',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        case 'VALIDATION_ERROR':
          throw new BadRequestException(
            'El servicio de correo rechazó el mail. Revisá las direcciones y los adjuntos.',
          );
        default:
          this.logger.warn(`clickmail send failed: ${code ?? (error instanceof Error ? error.name : 'error')}`);
          throw new BadGatewayException('No pudimos enviar el mail. Probá de nuevo en un momento.');
      }
    }
  }

  /** email.sent / delivered / bounced / complained / failed → the message's state. */
  async onDeliveryEvent(type: string, data: EmailEventData): Promise<boolean> {
    const message = await this.prisma.message.findUnique({ where: { clickmailEmailId: data.email_id } });
    if (!message) return false;
    const next: Partial<Record<string, MessageStatus>> = {
      'email.sent': 'SENT',
      'email.delivered': 'DELIVERED',
      'email.bounced': 'BOUNCED',
      'email.failed': 'FAILED',
    };
    const status = next[type];
    const update: Prisma.MessageUpdateInput = {};
    if (type === 'email.sent' && data.message_id && !message.messageIdHeader) update.messageIdHeader = data.message_id;
    if (status && RANK[status] > RANK[message.status]) update.status = status;
    if (type === 'email.complained') update.statusDetail = 'complaint';
    else if ((type === 'email.bounced' || type === 'email.failed') && data.error)
      update.statusDetail = data.error.slice(0, 200);
    if (!Object.keys(update).length) return false;
    await this.prisma.message.update({ where: { id: message.id }, data: update });
    return true;
  }
}
