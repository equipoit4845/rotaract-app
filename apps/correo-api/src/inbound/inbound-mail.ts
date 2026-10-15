import type { EmailReceivedData, InboundEmail } from '@clickmail/sdk';

/** A received email, whether it came in the webhook or from `GET /v1/inbound/:id`. */
export type InboundMail = {
  inboundId: string;
  from: { email: string; name: string | null };
  to: string[];
  cc: string[];
  replyTo: string[];
  subject: string;
  text: string | null;
  html: string | null;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  /** Id of the email we sent that this one replies to (ClickMail matched it). */
  inReplyToEmailId: string | null;
  receivedAt: Date;
  spf: string | null;
  dkim: string | null;
  dmarc: string | null;
  spam: string | null;
  attachments: Array<{
    id: string;
    filename: string;
    contentType: string | null;
    contentId: string | null;
    sizeBytes: number;
    stored: boolean;
  }>;
};

const lower = (list: Array<string | { email: string }> | null | undefined) =>
  (list ?? []).map((a) => (typeof a === 'string' ? a : a.email).trim().toLowerCase()).filter(Boolean);

const messageIds = (value: string | null | undefined) => (value ? (value.match(/<[^<>\s]+>/g) ?? []) : []);

export function fromWebhook(data: EmailReceivedData): InboundMail {
  return {
    inboundId: data.id,
    from: { email: data.from.email.toLowerCase(), name: data.from.name ?? null },
    to: lower(data.to),
    cc: lower(data.cc),
    replyTo: lower(data.reply_to),
    subject: data.subject ?? '',
    text: data.text,
    html: data.html,
    messageId: data.message_id,
    inReplyTo: data.in_reply_to,
    references: data.references ?? [],
    inReplyToEmailId: data.in_reply_to_email_id ?? null,
    receivedAt: new Date(data.received_at),
    spf: data.spf_verdict,
    dkim: data.dkim_verdict,
    dmarc: data.dmarc_verdict,
    spam: data.spam_verdict,
    attachments: data.attachments.map((a) => ({
      id: a.id,
      filename: a.filename ?? 'adjunto',
      contentType: a.content_type,
      contentId: a.content_id,
      sizeBytes: a.size_bytes,
      stored: a.stored,
    })),
  };
}

/** The API's shape has no in-reply-to/references fields: they come from the headers. */
export function fromApi(email: InboundEmail): InboundMail {
  const header = (name: string) => {
    const key = Object.keys(email.headers ?? {}).find((k) => k.toLowerCase() === name);
    return key ? email.headers![key] : null;
  };
  return {
    inboundId: email.id,
    from: { email: email.fromEmail.toLowerCase(), name: email.fromName },
    to: lower(email.toEmails),
    cc: lower(email.ccEmails),
    replyTo: lower(email.replyToEmails),
    subject: email.subject ?? '',
    text: email.text,
    html: email.html,
    messageId: email.messageIdHeader,
    inReplyTo: messageIds(header('in-reply-to'))[0] ?? null,
    references: messageIds(header('references')),
    inReplyToEmailId: email.inReplyToEmailId ?? null,
    receivedAt: new Date(email.receivedAt),
    spf: email.spfVerdict,
    dkim: email.dkimVerdict,
    dmarc: email.dmarcVerdict,
    spam: email.spamVerdict,
    attachments: email.attachments.map((a) => ({
      id: a.id,
      filename: a.filename ?? 'adjunto',
      contentType: a.contentType,
      contentId: a.contentId,
      sizeBytes: a.sizeBytes,
      stored: a.stored,
    })),
  };
}

/** Plain text of an HTML body (tags, styles and scripts dropped; entities decoded). */
export function htmlToText(html: string | null): string {
  return (html ?? '')
    .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*/g, '\n\n')
    .trim();
}

/** First 160 characters of the body, on one line, for the thread list. */
export function snippetOf(text: string | null, html: string | null): string {
  return (text ?? htmlToText(html)).replace(/\s+/g, ' ').trim().slice(0, 160);
}
