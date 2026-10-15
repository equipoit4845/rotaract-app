import { Injectable } from '@nestjs/common';
import { ClickMail, type InboundEmail } from '@clickmail/sdk';
import type { MailProvider, OutgoingMail, OutgoingReply } from './mail-provider';

/**
 * ClickMail (SDK 0.4.0). Env: CORREO_CLICKMAIL_API_KEY — its own key, not the
 * kernel's, with the send, `inbound:read` and `inbound:write` scopes.
 */
@Injectable()
export class ClickMailProvider implements MailProvider {
  private instance: ClickMail | null = null;

  get configured(): boolean {
    return !!process.env.CORREO_CLICKMAIL_API_KEY;
  }

  private get client(): ClickMail {
    if (!this.configured) throw new Error('Falta CORREO_CLICKMAIL_API_KEY');
    this.instance ??= new ClickMail({
      apiKey: process.env.CORREO_CLICKMAIL_API_KEY!,
      ...(process.env.CORREO_CLICKMAIL_BASE_URL ? { baseUrl: process.env.CORREO_CLICKMAIL_BASE_URL } : {}),
    });
    return this.instance;
  }

  async ensureAddress(input: { localPart: string; host: string; name: string }): Promise<string> {
    const address = `${input.localPart}@${input.host}`;
    const existing = (await this.client.inbound.addresses.list({ host: input.host })).find(
      (a) => a.address === address,
    );
    if (existing) return existing.id;
    const created = await this.client.inbound.addresses.create({
      localPart: input.localPart,
      host: input.host,
      name: input.name,
      deliverToInbox: true,
    });
    return created.id;
  }

  async setAddressActive(id: string, active: boolean): Promise<void> {
    await this.client.inbound.addresses.update(id, { active });
  }

  async ensureSender(input: { email: string; name: string }): Promise<string> {
    const existing = (await this.client.senders.list()).find((s) => s.email.toLowerCase() === input.email);
    if (existing) return existing.id;
    const created = await this.client.senders.create({ email: input.email, name: input.name });
    return created.id;
  }

  async setSenderActive(id: string, active: boolean): Promise<void> {
    await this.client.senders.update(id, { active });
  }

  async listInbound(query: { to: string; dateFrom: Date; page: number }) {
    const { data, meta } = await this.client.inbound.list({
      to: query.to,
      dateFrom: query.dateFrom.toISOString(),
      status: 'PROCESSED',
      page: query.page,
      limit: 50,
    });
    return { items: data, pages: meta.pages };
  }

  getInbound(id: string): Promise<InboundEmail> {
    return this.client.inbound.get(id);
  }

  async attachmentUrl(inboundId: string, attachmentId: string): Promise<string> {
    return (await this.client.inbound.getAttachment(inboundId, attachmentId)).url;
  }

  async send(mail: OutgoingMail): Promise<string> {
    const { id } = await this.client.emails.send({
      from: mail.from,
      to: mail.to,
      ...(mail.cc?.length ? { cc: mail.cc } : {}),
      ...(mail.bcc?.length ? { bcc: mail.bcc } : {}),
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      ...(mail.attachments?.length ? { attachments: mail.attachments } : {}),
      ...(mail.inReplyToEmailId ? { inReplyToEmailId: mail.inReplyToEmailId } : {}),
      idempotencyKey: mail.idempotencyKey,
    });
    return id;
  }

  async reply(inboundId: string, reply: OutgoingReply): Promise<string> {
    const { idempotencyKey, ...payload } = reply;
    const { id } = await this.client.inbound.reply(
      inboundId,
      {
        from: payload.from,
        ...(payload.subject ? { subject: payload.subject } : {}),
        text: payload.text,
        html: payload.html,
        replyAll: payload.replyAll,
        ...(payload.cc?.length ? { cc: payload.cc } : {}),
        ...(payload.bcc?.length ? { bcc: payload.bcc } : {}),
        ...(payload.attachments?.length ? { attachments: payload.attachments } : {}),
      },
      { idempotencyKey },
    );
    return id;
  }
}
