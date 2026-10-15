/**
 * Sending against a real Postgres (CORREO_DATABASE_URL — a throwaway
 * database, never production), with the kernel, ClickMail and the kernel
 * permission check faked.
 */
import { createHmac } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AccessService } from '../src/kernel/access.service';
import { KERNEL_DIRECTORY } from '../src/kernel/kernel.service';
import { MAIL_PROVIDER } from '../src/mail-provider/mail-provider';
import { MailboxesService } from '../src/mailboxes/mailboxes.service';
import { textToHtml } from '../src/outbound/outbound.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { authority, FakeKernel, FakeMail } from './fakes';

process.env.CORREO_JOBS_ENABLED = 'false';
process.env.CORREO_CLICKMAIL_WEBHOOK_SECRET = 'whsec_clickmail_test_0123456789';
process.env.CORREO_TOKEN_SECRET = 't'.repeat(40);

const FACU = 'facundo.cubells@rotaract4845.com';
const RDR = 'rdr@rotaract4845.com';
const key = (n: number) => `test-key-${String(n).padStart(8, '0')}`;

const token = (sub: string) =>
  new JwtService({ secret: process.env.CORREO_TOKEN_SECRET }).signAsync(
    { name: 'x' },
    { subject: sub, audience: 'correo-api', issuer: 'correo-web', expiresIn: '10m', algorithm: 'HS256' },
  );

describe('sending mail (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const kernel = new FakeKernel();
  const mail = new FakeMail();
  let auth: string;
  let facuBox: string;

  const http = () => request(app.getHttpServer());
  const compose = (mailboxId: string, payload: object, files: Array<[string, Buffer]> = []) => {
    const r = http()
      .post(`/correo-api/mailboxes/${mailboxId}/messages`)
      .set('Authorization', auth)
      .field('payload', JSON.stringify(payload));
    for (const [name, content] of files) r.attach('attachments', content, name);
    return r;
  };
  const reply = (threadId: string, payload: object) =>
    http()
      .post(`/correo-api/threads/${threadId}/reply`)
      .set('Authorization', auth)
      .field('payload', JSON.stringify(payload));
  const clickmailEvent = (event: object) => {
    const body = JSON.stringify(event);
    const sig = createHmac('sha256', process.env.CORREO_CLICKMAIL_WEBHOOK_SECRET!).update(body).digest('hex');
    return http()
      .post('/correo-api/webhooks/clickmail')
      .set({ 'X-Webhook-Signature': sig, 'Content-Type': 'application/json' })
      .send(body);
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(KERNEL_DIRECTORY)
      .useValue(kernel)
      .overrideProvider(MAIL_PROVIDER)
      .useValue(mail)
      .overrideProvider(AccessService)
      .useValue({ forPerson: async () => ({ canUse: true, canManage: false }), forget: () => undefined })
      .compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('correo-api');
    await app.init();
    prisma = app.get(PrismaService);
    auth = `Bearer ${await token('p-facu')}`;
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE "Draft","AuditEvent","WebhookReceipt","Attachment","Message","Thread","MailboxAssignment","Mailbox" CASCADE',
    );
    mail.resetSends();
    kernel.people.set('p-facu', {
      id: 'p-facu',
      displayName: 'Facundo Cubells',
      firstName: 'Facundo',
      lastName: 'Cubells',
      updatedAt: '',
    });
    await app.get(MailboxesService).activate(authority({ appointmentId: 'a1', personId: 'p-facu' }), 'kernel');
    facuBox = (await prisma.mailbox.findUniqueOrThrow({ where: { address: FACU } })).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('textToHtml escapes and keeps paragraphs', () => {
    expect(textToHtml('<b>Hola</b>\nlínea\n\nchau')).toContain('<p>&lt;b&gt;Hola&lt;/b&gt;<br>línea</p>\n<p>chau</p>');
  });

  it('composes a new email with attachments from the personal mailbox', async () => {
    const res = await compose(
      facuBox,
      {
        to: ['Presidencia@ClubCentro.org, tesoreria@clubcentro.org'],
        cc: ['rotary@example.org'],
        bcc: [],
        subject: 'Convocatoria',
        text: 'Hola,\nlos esperamos.',
        idempotencyKey: key(1),
      },
      [['acta.pdf', Buffer.from('%PDF-1.4 test')]],
    ).expect(201);

    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]).toMatchObject({
      from: `Facundo Cubells <${FACU}>`,
      to: ['presidencia@clubcentro.org', 'tesoreria@clubcentro.org'],
      cc: ['rotary@example.org'],
      subject: 'Convocatoria',
    });
    expect(mail.sent[0].attachments![0].filename).toBe('acta.pdf');
    expect(mail.sent[0].attachments![0].content.toString()).toBe('%PDF-1.4 test');

    const message = await prisma.message.findUniqueOrThrow({
      where: { id: res.body.messageId },
      include: { attachments: true },
    });
    expect(message).toMatchObject({
      direction: 'OUT',
      status: 'QUEUED',
      sentByPersonId: 'p-facu',
      clickmailEmailId: 'email_1',
    });
    expect(message.attachments.map((a) => a.filename)).toEqual(['acta.pdf']);

    const sent = await http()
      .get(`/correo-api/mailboxes/${facuBox}/threads?folder=SENT`)
      .set('Authorization', auth)
      .expect(200);
    expect(sent.body.items.map((t: { subject: string }) => t.subject)).toEqual(['Convocatoria']);
  });

  it('sends the editor HTML cleaned again, with inline images by cid', async () => {
    const res = http()
      .post(`/correo-api/mailboxes/${facuBox}/messages`)
      .set('Authorization', auth)
      .field(
        'payload',
        JSON.stringify({
          to: ['a@example.org'],
          subject: 'Con formato',
          text: 'Hola fuerte',
          html: '<p onclick="x()">Hola <strong>fuerte</strong> <a href="javascript:alert(1)">mal</a></p><img src="cid:img1.abc@correo" alt="logo"><script>alert(1)</script>',
          inlineIds: ['img1.abc@correo'],
          idempotencyKey: key(20),
        }),
      )
      .attach('inline', Buffer.from('PNGDATA'), { filename: 'logo.png', contentType: 'image/png' });
    await res.expect(201);
    const sent = mail.sent[0];
    expect(sent.html).toContain(
      '<p>Hola <strong>fuerte</strong> <a target="_blank" rel="noopener noreferrer">mal</a></p><img src="cid:img1.abc@correo" alt="logo" />',
    );
    expect(sent.html).not.toContain('script');
    expect(sent.attachments).toEqual([expect.objectContaining({ filename: 'logo.png', contentId: 'img1.abc@correo' })]);
    const att = await prisma.attachment.findFirstOrThrow();
    expect(att.contentId).toBe('img1.abc@correo');
  });

  it('rejects inline images whose ids do not match', async () => {
    await http()
      .post(`/correo-api/mailboxes/${facuBox}/messages`)
      .set('Authorization', auth)
      .field(
        'payload',
        JSON.stringify({ to: ['a@example.org'], subject: 's', text: 't', inlineIds: [], idempotencyKey: key(21) }),
      )
      .attach('inline', Buffer.from('x'), 'a.png')
      .expect(400);
  });

  it('the same idempotency key never sends twice nor duplicates the row', async () => {
    const payload = { to: ['a@example.org'], subject: 'x', text: 'y', idempotencyKey: key(2) };
    const first = await compose(facuBox, payload).expect(201);
    const second = await compose(facuBox, payload).expect(201);
    expect(second.body).toEqual(first.body);
    expect(await prisma.message.count()).toBe(1);
  });

  it('rejects bad recipients, blocked attachment types and an empty body', async () => {
    await compose(facuBox, { to: ['no-es-un-mail'], subject: 's', text: 't', idempotencyKey: key(3) }).expect(400);
    await compose(facuBox, { to: ['a@example.org'], subject: 's', text: 't', idempotencyKey: key(4) }, [
      ['virus.exe', Buffer.from('MZ')],
    ]).expect(400);
    await compose(facuBox, { to: ['a@example.org'], subject: 's', text: '  ', idempotencyKey: key(5) }).expect(400);
    expect(mail.sent).toHaveLength(0);
  });

  it('a READ_ONLY mailbox cannot send; ClickMail SENDER_DISABLED reads the same', async () => {
    await app.get(MailboxesService).end('a1', 'kernel');
    const ro = await compose(facuBox, {
      to: ['a@example.org'],
      subject: 's',
      text: 't',
      idempotencyKey: key(6),
    }).expect(403);
    expect(ro.body.message).toMatch(/solo lectura/);

    const rdrBox = (await prisma.mailbox.findUniqueOrThrow({ where: { address: RDR } })).id;
    // The alias stays ACTIVE but the person no longer holds it.
    await compose(rdrBox, { to: ['a@example.org'], subject: 's', text: 't', idempotencyKey: key(7) }).expect(404);

    await app.get(MailboxesService).activate(authority({ appointmentId: 'a2', personId: 'p-facu' }), 'kernel');
    mail.nextError = Object.assign(new Error('disabled'), { code: 'SENDER_DISABLED' });
    const disabled = await compose(facuBox, {
      to: ['a@example.org'],
      subject: 's',
      text: 't',
      idempotencyKey: key(8),
    }).expect(403);
    expect(disabled.body.message).toMatch(/ya no puede enviar/);
  });

  it('replies to a received email through ClickMail reply; reply all copies the others but not us', async () => {
    const thread = await prisma.thread.create({
      data: { mailboxId: facuBox, subject: 'Cuotas', lastMessageAt: new Date() },
    });
    await prisma.message.create({
      data: {
        threadId: thread.id,
        mailboxId: facuBox,
        direction: 'IN',
        clickmailInboundId: 'in_77',
        messageIdHeader: '<orig@clubcentro.org>',
        fromEmail: 'presidencia@clubcentro.org',
        toEmails: [FACU, 'secretaria@clubcentro.org'],
        ccEmails: [RDR, 'socio@clubcentro.org'],
        subject: 'Cuotas',
        status: 'RECEIVED',
        at: new Date(),
      },
    });

    await reply(thread.id, { replyAll: true, text: 'Recibido, gracias.', idempotencyKey: key(9) }).expect(201);
    expect(mail.replies).toHaveLength(1);
    expect(mail.replies[0]).toMatchObject({
      inboundId: 'in_77',
      reply: { from: `Facundo Cubells <${FACU}>`, replyAll: true, subject: 'Re: Cuotas' },
    });
    const out = await prisma.message.findFirstOrThrow({ where: { direction: 'OUT' } });
    expect(out.toEmails).toEqual(['presidencia@clubcentro.org']);
    expect(out.ccEmails.sort()).toEqual(['secretaria@clubcentro.org', 'socio@clubcentro.org']);
    expect(out.inReplyTo).toBe('<orig@clubcentro.org>');
    expect(out.threadId).toBe(thread.id);
  });

  it('following up on our own email sends threaded on it (inReplyToEmailId)', async () => {
    const res = await compose(facuBox, {
      to: ['a@example.org'],
      subject: 'Pedido',
      text: '1',
      idempotencyKey: key(10),
    }).expect(201);
    await reply(res.body.threadId, { replyAll: false, text: '¿Lo vieron?', idempotencyKey: key(11) }).expect(201);
    expect(mail.sent[1]).toMatchObject({ to: ['a@example.org'], subject: 'Re: Pedido', inReplyToEmailId: 'email_1' });
    expect(await prisma.message.count({ where: { threadId: res.body.threadId } })).toBe(2);
  });

  it('delivery webhooks move the state forward; a reply to it lands in the same thread', async () => {
    const res = await compose(facuBox, {
      to: ['a@example.org'],
      subject: 'Aviso',
      text: 'x',
      idempotencyKey: key(12),
    }).expect(201);
    const ev = (id: string, type: string, data: object) =>
      clickmailEvent({
        id,
        type,
        project_id: 'p',
        timestamp: new Date().toISOString(),
        data: { email_id: 'email_1', status: type, ...data },
      });

    await ev('e1', 'email.delivered', {}).expect(200);
    await ev('e2', 'email.sent', { message_id: '<sent-1@rotaract4845.com>' }).expect(200);
    const m = await prisma.message.findUniqueOrThrow({ where: { id: res.body.messageId } });
    expect(m.status).toBe('DELIVERED');
    expect(m.messageIdHeader).toBe('<sent-1@rotaract4845.com>');

    await ev('e3', 'email.bounced', { error: 'General' }).expect(200);
    expect((await prisma.message.findUniqueOrThrow({ where: { id: res.body.messageId } })).status).toBe('BOUNCED');

    await clickmailEvent({
      id: 'e4',
      type: 'email.received',
      project_id: 'p',
      timestamp: new Date().toISOString(),
      data: {
        id: 'in_reply_1',
        project_id: 'p',
        from: { email: 'a@example.org', name: null },
        to: [{ email: FACU, name: null }],
        cc: [],
        reply_to: [],
        subject: 'Re: Aviso',
        text: 'ok',
        html: null,
        message_id: '<r1@example.org>',
        in_reply_to: '<sent-1@rotaract4845.com>',
        references: [],
        received_at: new Date().toISOString(),
        spam_verdict: 'PASS',
        virus_verdict: 'PASS',
        spf_verdict: 'PASS',
        dkim_verdict: 'PASS',
        dmarc_verdict: 'PASS',
        attachments: [],
        in_reply_to_email_id: null,
      },
    }).expect(200);
    expect(await prisma.message.count({ where: { threadId: res.body.threadId } })).toBe(2);
  });
});
