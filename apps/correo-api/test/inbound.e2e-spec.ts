/**
 * Receiving mail against a real Postgres (CORREO_DATABASE_URL — a throwaway
 * database, never production), with the kernel, ClickMail and the kernel
 * permission check faked.
 */
import { createHmac } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { EmailReceivedData, InboundEmail } from '@clickmail/sdk';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { InboundService } from '../src/inbound/inbound.service';
import { AccessService } from '../src/kernel/access.service';
import { KERNEL_DIRECTORY } from '../src/kernel/kernel.service';
import { MAIL_PROVIDER } from '../src/mail-provider/mail-provider';
import { MailboxesService } from '../src/mailboxes/mailboxes.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { authority, FakeKernel, FakeMail } from './fakes';

process.env.CORREO_JOBS_ENABLED = 'false';
process.env.CORREO_CLICKMAIL_WEBHOOK_SECRET = 'whsec_clickmail_test_0123456789';
process.env.CORREO_TOKEN_SECRET = 't'.repeat(40);

const FACU = 'facundo.cubells@rotaract4845.com';
const RDR = 'rdr@rotaract4845.com';

let seq = 0;
function received(over: Partial<EmailReceivedData> = {}): EmailReceivedData {
  seq++;
  return {
    id: `in_${seq}`,
    project_id: 'proj',
    from: { email: 'presidencia@clubcentro.org', name: 'Club Centro' },
    to: [{ email: FACU, name: null }],
    cc: [],
    reply_to: [],
    subject: 'Cuotas 2026',
    text: 'Hola Facundo,\nadjuntamos el comprobante.',
    html: null,
    message_id: `<msg-${seq}@clubcentro.org>`,
    in_reply_to: null,
    references: [],
    received_at: new Date(Date.UTC(2026, 9, 15, 18, seq)).toISOString(),
    spam_verdict: 'PASS',
    virus_verdict: 'PASS',
    spf_verdict: 'PASS',
    dkim_verdict: 'PASS',
    dmarc_verdict: 'PASS',
    attachments: [],
    in_reply_to_email_id: null,
    ...over,
  };
}

function signed(event: object) {
  const body = JSON.stringify(event);
  const sig = createHmac('sha256', process.env.CORREO_CLICKMAIL_WEBHOOK_SECRET!).update(body).digest('hex');
  return { body, headers: { 'X-Webhook-Signature': sig, 'Content-Type': 'application/json' } };
}

const token = (sub: string) =>
  new JwtService({ secret: process.env.CORREO_TOKEN_SECRET }).signAsync(
    { name: 'x' },
    { subject: sub, audience: 'correo-api', issuer: 'correo-web', expiresIn: '10m', algorithm: 'HS256' },
  );

describe('receiving mail (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let inbound: InboundService;
  const kernel = new FakeKernel();
  const mail = new FakeMail();
  const allowed = new Set(['p-facu', 'p-ana']);

  const post = (event: object) => {
    const { body, headers } = signed(event);
    return request(app.getHttpServer()).post('/correo-api/webhooks/clickmail').set(headers).send(body);
  };
  const deliver = (data: EmailReceivedData) =>
    post({ id: `evt_${data.id}`, type: 'email.received', project_id: 'proj', timestamp: data.received_at, data });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(KERNEL_DIRECTORY)
      .useValue(kernel)
      .overrideProvider(MAIL_PROVIDER)
      .useValue(mail)
      .overrideProvider(AccessService)
      .useValue({
        forPerson: async (p: string) => ({ canUse: allowed.has(p), canManage: false }),
        forget: () => undefined,
      })
      .compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('correo-api');
    await app.init();
    prisma = app.get(PrismaService);
    inbound = app.get(InboundService);
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE "Draft","AuditEvent","WebhookReceipt","Attachment","Message","Thread","MailboxAssignment","Mailbox" CASCADE',
    );
    mail.addresses.clear();
    mail.senders.clear();
    mail.inbound = [];
    kernel.people.set('p-facu', {
      id: 'p-facu',
      displayName: 'Facundo Cubells',
      firstName: 'Facundo',
      lastName: 'Cubells',
      updatedAt: '',
    });
    kernel.people.set('p-ana', {
      id: 'p-ana',
      displayName: 'Ana Pérez',
      firstName: 'Ana',
      lastName: 'Pérez',
      updatedAt: '',
    });
    await app.get(MailboxesService).activate(authority({ appointmentId: 'a1', personId: 'p-facu' }), 'kernel');
    await app
      .get(MailboxesService)
      .activate(authority({ appointmentId: 's1', personId: 'p-ana', positionCode: 'DISTRICT_SECRETARY' }), 'kernel');
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects a bad signature and stores nothing', async () => {
    const data = received();
    const body = JSON.stringify({ id: 'evt_x', type: 'email.received', data });
    await request(app.getHttpServer())
      .post('/correo-api/webhooks/clickmail')
      .set({ 'X-Webhook-Signature': 'ab'.repeat(32), 'Content-Type': 'application/json' })
      .send(body)
      .expect(400);
    expect(await prisma.message.count()).toBe(0);
  });

  it('email.received lands in the addressed mailbox as a new unread thread; the retry is ignored', async () => {
    const data = received({
      attachments: [
        {
          id: 'att_1',
          filename: 'comprobante.pdf',
          content_type: 'application/pdf',
          content_disposition: 'attachment',
          size_bytes: 20480,
          content_id: null,
          checksum_sha256: null,
          stored: true,
          download_url: null,
        },
      ],
    });
    await deliver(data).expect(200);
    const again = await deliver(data).expect(200);
    expect(again.body).toEqual({ received: true, duplicate: true });

    const threads = await prisma.thread.findMany({
      include: { mailbox: true, messages: { include: { attachments: true } } },
    });
    expect(threads).toHaveLength(1);
    expect(threads[0].mailbox.address).toBe(FACU);
    expect(threads[0].unreadCount).toBe(1);
    expect(threads[0].snippet).toBe('Hola Facundo, adjuntamos el comprobante.');
    expect(threads[0].messages[0].attachments.map((a) => a.filename)).toEqual(['comprobante.pdf']);
  });

  it('a mail to the personal address and the alias leaves one copy in each mailbox', async () => {
    await deliver(received({ to: [{ email: FACU, name: null }], cc: [{ email: RDR, name: null }] })).expect(200);
    const boxes = await prisma.message.findMany({ include: { mailbox: true } });
    expect(boxes.map((m) => m.mailbox.address).sort()).toEqual([FACU, RDR].sort());
  });

  it('mail to an address without a mailbox is acknowledged and dropped', async () => {
    await deliver(received({ to: [{ email: 'it@rotaract4845.com', name: null }] })).expect(200);
    expect(await prisma.message.count()).toBe(0);
  });

  it('replies join their conversation by In-Reply-To / References; a new subject alone does not', async () => {
    const first = received();
    await deliver(first).expect(200);
    await deliver(received({ subject: 'Re: Cuotas 2026', in_reply_to: first.message_id })).expect(200);
    await deliver(received({ subject: 'Re: Cuotas 2026', references: ['<other@x>', first.message_id!] })).expect(200);
    await deliver(received({ subject: 'Cuotas 2026' })).expect(200);

    const threads = await prisma.thread.findMany({
      include: { _count: { select: { messages: true } } },
      orderBy: { createdAt: 'asc' },
    });
    expect(threads.map((t) => t._count.messages)).toEqual([3, 1]);
    expect(threads[0].unreadCount).toBe(3);
  });

  it('a reply to an email we sent joins its thread through in_reply_to_email_id', async () => {
    const mailbox = await prisma.mailbox.findUniqueOrThrow({ where: { address: FACU } });
    const thread = await prisma.thread.create({
      data: { mailboxId: mailbox.id, subject: 'Convocatoria', lastMessageAt: new Date() },
    });
    await prisma.message.create({
      data: {
        threadId: thread.id,
        mailboxId: mailbox.id,
        direction: 'OUT',
        clickmailEmailId: 'email_sent_1',
        fromEmail: FACU,
        toEmails: ['presidencia@clubcentro.org'],
        subject: 'Convocatoria',
        status: 'SENT',
        at: new Date(),
      },
    });
    await deliver(received({ subject: 'Re: Convocatoria', in_reply_to_email_id: 'email_sent_1' })).expect(200);
    expect(await prisma.message.count({ where: { threadId: thread.id } })).toBe(2);
  });

  it('spam goes to the Spam folder', async () => {
    await deliver(received({ spam_verdict: 'FAIL' })).expect(200);
    expect((await prisma.thread.findFirstOrThrow()).folder).toBe('SPAM');
  });

  it('backfill imports what a lost webhook did not bring, once', async () => {
    const lost: InboundEmail = {
      id: 'in_lost',
      projectId: 'proj',
      domainId: null,
      fromEmail: 'tesoreria@rotary.org',
      fromName: 'Rotary',
      toEmails: [FACU],
      ccEmails: null,
      subject: 'Re: Aporte',
      status: 'PROCESSED',
      spamVerdict: 'PASS',
      virusVerdict: 'PASS',
      spfVerdict: 'PASS',
      dkimVerdict: 'PASS',
      dmarcVerdict: 'PASS',
      sizeBytes: 100,
      read: false,
      receivedAt: new Date(Date.now() + 1000).toISOString(),
      createdAt: new Date().toISOString(),
      sesMessageId: 'ses_1',
      messageIdHeader: '<lost@rotary.org>',
      replyToEmails: null,
      bccEmails: null,
      text: null,
      html: '<p>Hola &amp; gracias</p><script>alert(1)</script>',
      headers: { 'In-Reply-To': '<nope@x>' },
      addressId: null,
      failureReason: null,
      processedAt: null,
      updatedAt: new Date().toISOString(),
      attachments: [],
      inReplyToEmailId: null,
    };
    mail.inbound = [lost];
    await expect(inbound.backfill()).resolves.toBe(1);
    await expect(inbound.backfill()).resolves.toBe(0);
    const message = await prisma.message.findFirstOrThrow({ include: { thread: true } });
    expect(message.inReplyTo).toBe('<nope@x>');
    expect(message.thread.snippet).toBe('Hola & gracias');
  });

  describe('reading API', () => {
    it('lists threads, opens one (marks it read) and links an attachment — only for the holder', async () => {
      await deliver(
        received({
          subject: 'Comprobante',
          spf_verdict: 'FAIL',
          attachments: [
            {
              id: 'att_9',
              filename: 'recibo.pdf',
              content_type: 'application/pdf',
              content_disposition: 'attachment',
              size_bytes: 1000,
              content_id: null,
              checksum_sha256: null,
              stored: true,
              download_url: null,
            },
          ],
        }),
      ).expect(200);
      const mailbox = await prisma.mailbox.findUniqueOrThrow({ where: { address: FACU } });
      const facu = `Bearer ${await token('p-facu')}`;
      const ana = `Bearer ${await token('p-ana')}`;
      const nobody = `Bearer ${await token('p-nobody')}`;

      const list = await request(app.getHttpServer())
        .get(`/correo-api/mailboxes/${mailbox.id}/threads`)
        .set('Authorization', facu)
        .expect(200);
      expect(list.body.items).toHaveLength(1);
      expect(list.body.items[0]).toMatchObject({ subject: 'Comprobante', unread: true, hasAttachments: true });

      // Another authority, and someone without the permission: the mailbox "does not exist".
      await request(app.getHttpServer())
        .get(`/correo-api/mailboxes/${mailbox.id}/threads`)
        .set('Authorization', ana)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/correo-api/mailboxes/${mailbox.id}/threads`)
        .set('Authorization', nobody)
        .expect(404);

      const threadId = list.body.items[0].id;
      const thread = await request(app.getHttpServer())
        .get(`/correo-api/threads/${threadId}`)
        .set('Authorization', facu)
        .expect(200);
      expect(thread.body.messages[0]).toMatchObject({
        suspicious: true,
        body: 'Hola Facundo,\nadjuntamos el comprobante.',
      });
      await request(app.getHttpServer()).get(`/correo-api/threads/${threadId}`).set('Authorization', ana).expect(404);
      expect((await prisma.thread.findUniqueOrThrow({ where: { id: threadId } })).unreadCount).toBe(0);

      const att = thread.body.messages[0].attachments[0];
      const link = await request(app.getHttpServer())
        .get(`/correo-api/messages/${thread.body.messages[0].id}/attachments/${att.id}`)
        .set('Authorization', facu)
        .expect(200);
      expect(link.body).toEqual({ url: expect.stringContaining('att_9'), filename: 'recibo.pdf' });
      await request(app.getHttpServer())
        .get(`/correo-api/messages/${thread.body.messages[0].id}/attachments/${att.id}`)
        .set('Authorization', ana)
        .expect(404);

      const audit = await prisma.auditEvent.findMany({ where: { actorPersonId: 'p-facu' }, select: { action: true } });
      expect(audit.map((a) => a.action).sort()).toEqual(['attachment.downloaded', 'thread.opened']);
    });
  });
});
