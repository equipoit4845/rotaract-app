/**
 * Inbox actions and the reader's HTML against a real Postgres
 * (CORREO_DATABASE_URL — a throwaway database, never production).
 */
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AccessService } from '../src/kernel/access.service';
import { KERNEL_DIRECTORY } from '../src/kernel/kernel.service';
import { MAIL_PROVIDER } from '../src/mail-provider/mail-provider';
import { MailboxesService } from '../src/mailboxes/mailboxes.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { authority, FakeKernel, FakeMail } from './fakes';

process.env.CORREO_JOBS_ENABLED = 'false';
process.env.CORREO_TOKEN_SECRET = 't'.repeat(40);

const FACU = 'facundo.cubells@rotaract4845.com';

const token = (sub: string) =>
  new JwtService({ secret: process.env.CORREO_TOKEN_SECRET }).signAsync(
    { name: 'x' },
    { subject: sub, audience: 'correo-api', issuer: 'correo-web', expiresIn: '10m', algorithm: 'HS256' },
  );

describe('inbox actions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const kernel = new FakeKernel();
  let facu: string;
  let ana: string;
  let box: string;

  const http = () => request(app.getHttpServer());
  const act = (auth: string, body: object) =>
    http().post('/correo-api/threads/actions').set('Authorization', auth).send(body);

  async function thread(subject: string, opts: { html?: string; unread?: number; attachment?: boolean } = {}) {
    const t = await prisma.thread.create({
      data: { mailboxId: box, subject, lastMessageAt: new Date(), unreadCount: opts.unread ?? 1 },
    });
    await prisma.message.create({
      data: {
        threadId: t.id,
        mailboxId: box,
        direction: 'IN',
        clickmailInboundId: `in_${t.id}`,
        fromEmail: 'club@example.org',
        toEmails: [FACU],
        subject,
        text: opts.html ? null : 'hola',
        html: opts.html ?? null,
        status: 'RECEIVED',
        at: new Date(),
        ...(opts.attachment
          ? { attachments: { create: [{ filename: 'a.pdf', sizeBytes: 10, clickmailAttachmentId: 'att' }] } }
          : {}),
      },
    });
    return t.id;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(KERNEL_DIRECTORY)
      .useValue(kernel)
      .overrideProvider(MAIL_PROVIDER)
      .useValue(new FakeMail())
      .overrideProvider(AccessService)
      .useValue({ forPerson: async () => ({ canUse: true, canManage: false }), forget: () => undefined })
      .compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('correo-api');
    await app.init();
    prisma = app.get(PrismaService);
    facu = `Bearer ${await token('p-facu')}`;
    ana = `Bearer ${await token('p-ana')}`;
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE "Draft","AuditEvent","WebhookReceipt","Attachment","Message","Thread","MailboxAssignment","Mailbox" CASCADE',
    );
    kernel.people.set('p-facu', {
      id: 'p-facu',
      displayName: 'Facundo Cubells',
      firstName: 'Facundo',
      lastName: 'Cubells',
      updatedAt: '',
    });
    await app.get(MailboxesService).activate(authority({ appointmentId: 'a1', personId: 'p-facu' }), 'kernel');
    box = (await prisma.mailbox.findUniqueOrThrow({ where: { address: FACU } })).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('archives and undoes; the previous state comes back in the answer', async () => {
    const a = await thread('Uno');
    const b = await thread('Dos', { unread: 0 });
    const res = await act(facu, { threadIds: [a, b], folder: 'ARCHIVE' }).expect(200);
    expect(res.body.previous).toEqual(
      expect.arrayContaining([
        { id: a, folder: 'INBOX', read: false },
        { id: b, folder: 'INBOX', read: true },
      ]),
    );
    const archived = await http()
      .get(`/correo-api/mailboxes/${box}/threads?folder=ARCHIVE`)
      .set('Authorization', facu)
      .expect(200);
    expect(archived.body.items).toHaveLength(2);

    await act(facu, { threadIds: [a, b], folder: 'INBOX' }).expect(200);
    const inbox = await http()
      .get(`/correo-api/mailboxes/${box}/threads?folder=INBOX`)
      .set('Authorization', facu)
      .expect(200);
    expect(inbox.body.items).toHaveLength(2);
  });

  it('marks read and unread; /me counts unread conversations in Recibidos', async () => {
    const a = await thread('Uno');
    await thread('Dos');
    let me = await http().get('/correo-api/me').set('Authorization', facu).expect(200);
    expect(me.body.mailboxes.find((m: { address: string }) => m.address === FACU).unread).toBe(2);

    await act(facu, { threadIds: [a], read: true }).expect(200);
    me = await http().get('/correo-api/me').set('Authorization', facu).expect(200);
    expect(me.body.mailboxes.find((m: { address: string }) => m.address === FACU).unread).toBe(1);

    await act(facu, { threadIds: [a], read: false }).expect(200);
    expect((await prisma.thread.findUniqueOrThrow({ where: { id: a } })).unreadCount).toBe(1);
  });

  it('a READ_ONLY mailbox can be marked read but not moved', async () => {
    const a = await thread('Uno');
    await app.get(MailboxesService).end('a1', 'kernel');
    await act(facu, { threadIds: [a], folder: 'TRASH' }).expect(403);
    await act(facu, { threadIds: [a], read: true }).expect(200);
  });

  it('someone else cannot act on the conversation; bad input is rejected', async () => {
    const a = await thread('Uno');
    await act(ana, { threadIds: [a], folder: 'ARCHIVE' }).expect(404);
    await act(facu, { threadIds: [], folder: 'ARCHIVE' }).expect(400);
    await act(facu, { threadIds: [a], folder: 'NOWHERE' }).expect(400);
    await act(facu, { threadIds: [a] }).expect(400);
    expect((await prisma.thread.findUniqueOrThrow({ where: { id: a } })).folder).toBe('INBOX');
  });

  it('the list flags attachments in any message; the reader gets sanitized HTML', async () => {
    const a = await thread('Con HTML', {
      html: '<p onclick="x()">Hola</p><script>alert(1)</script><img src="https://cdn.example/logo.png">',
      attachment: true,
    });
    const list = await http().get(`/correo-api/mailboxes/${box}/threads`).set('Authorization', facu).expect(200);
    expect(list.body.items[0]).toMatchObject({
      id: a,
      hasAttachments: true,
      to: [FACU],
      lastDirection: 'IN',
      folder: 'INBOX',
    });

    const t = await http().get(`/correo-api/threads/${a}`).set('Authorization', facu).expect(200);
    expect(t.body.messages[0].html).toBe('<p>Hola</p><img data-cd-src="https://cdn.example/logo.png" />');
    expect(t.body.messages[0].remoteImages).toBe(true);
    expect(t.body.messages[0].body).toBe('Hola');
  });
});
