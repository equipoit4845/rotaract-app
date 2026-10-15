import type { InboundEmail, InboundEmailSummary } from '@clickmail/sdk';

export type OutgoingAttachment = { filename: string; content: Buffer; contentType?: string };

export type OutgoingMail = {
  /** "Name <address>" of an active sender. */
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text: string;
  html: string;
  attachments?: OutgoingAttachment[];
  /** Id of an email we sent that this one answers (threading). */
  inReplyToEmailId?: string;
  /** Same key = same email: a retried request never sends twice. */
  idempotencyKey: string;
};

export type OutgoingReply = Omit<OutgoingMail, 'to' | 'inReplyToEmailId' | 'subject'> & {
  subject?: string;
  replyAll: boolean;
};

/**
 * What correo-api needs from the mail service. ClickMail in production; an
 * in-memory fake in tests.
 *
 * Every `ensure*` is idempotent: it returns the existing id when the address
 * or sender is already there.
 */
export interface MailProvider {
  /** false = no API key: mailboxes stay "pending" until one is configured. */
  readonly configured: boolean;
  ensureAddress(input: { localPart: string; host: string; name: string }): Promise<string>;
  setAddressActive(id: string, active: boolean): Promise<void>;
  ensureSender(input: { email: string; name: string }): Promise<string>;
  setSenderActive(id: string, active: boolean): Promise<void>;

  /** Received emails to `to` since `dateFrom`, newest first, one page. */
  listInbound(query: {
    to: string;
    dateFrom: Date;
    page: number;
  }): Promise<{ items: InboundEmailSummary[]; pages: number }>;
  getInbound(id: string): Promise<InboundEmail>;
  /** Short-lived presigned URL of an attachment's content. */
  attachmentUrl(inboundId: string, attachmentId: string): Promise<string>;

  /** Queues a new email; returns its ClickMail email id. */
  send(mail: OutgoingMail): Promise<string>;
  /** Replies to a received email (ClickMail sets the recipients and threading headers). */
  reply(inboundId: string, reply: OutgoingReply): Promise<string>;
}

export const MAIL_PROVIDER = Symbol('MAIL_PROVIDER');
