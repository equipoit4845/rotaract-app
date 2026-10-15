/**
 * Quick views, search, drafts, contacts and the 30-day Papelera against a
 * real Postgres (CORREO_DATABASE_URL — a throwaway database, never production).
 */
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TrashService } from '../src/inbox/trash.service';
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

describe('views, search and drafts (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const kernel = new FakeKernel();
  let facu: string;
  let ana: string;
  let box: string;
  let n = 0;

  const http = () => request(app.getHttpServer());
  const list = (query: string) =>
    http().get(`/correo-api/mailboxes/${box}/threads?${query}`).set('Authorization', facu);
  const subjects = async (query: string) =>
    (await list(query).expect(200)).body.items.map((t: { subject: string }) => t.subject).sort();

  async function thread(
    subject: string,
    o: {
      from?: string;
      lastOut?: boolean;
      unread?: number;
      attachment?: boolean;
      text?: string;
      folder?: 'INBOX' | 'TRASH';
    } = {},
  ) {
    n++;
    const t = await prisma.thread.create({
      data: {
        mailboxId: box,
        subject,
        snippet: o.text ?? '',
        folder: o.folder ?? 'INBOX',
        unreadCount: o.unread ?? 0,
        lastMessageAt: new Date(Date.now() - n * 1000),
        lastDirection: o.lastOut ? 'OUT' : 'IN',
      },
    });
    await prisma.message.create({
      data: {
        threadId: t.id,
        mailboxId: box,
        direction: o.lastOut ? 'OUT' : 'IN',
        fromEmail: o.lastOut ? FACU : (o.from ?? 'club@example.org'),
        fromName: o.lastOut ? 'Facundo' : 'Club Centro',
        toEmails: o.lastOut ? [o.from ?? 'club@example.org'] : [FACU],
        subject,
        text: o.text ?? 'hola',
        status: o.lastOut ? 'SENT' : 'RECEIVED',
        at: new Date(Date.now() - n * 1000),
        ...(o.attachment ? { attachments: { create: [{ filename: 'acta.pdf', sizeBytes: 10 }] } } : {}),
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

  it('quick views: unread, waiting for our reply, with attachments', async () => {
    await thread('Sin leer', { unread: 1 });
    await thread('Ya respondido', { lastOut: true });
    await thread('Con acta', { attachment: true });
    expect(await subjects('folder=INBOX&vista=no-leidos')).toEqual(['Sin leer']);
    expect(await subjects('folder=INBOX&vista=por-responder')).toEqual(['Con acta', 'Sin leer']);
    expect(await subjects('folder=INBOX&vista=con-adjuntos')).toEqual(['Con acta']);
    await list('folder=INBOX&vista=otra').expect(400);
  });

  it('search: words, de:, asunto:, adjunto; the Papelera is left out', async () => {
    await thread('Cuotas 2026', { from: 'tesoreria@clubnorte.org', text: 'pago de cuotas' });
    await thread('Convocatoria asamblea', { from: 'rdr@rotary.org', attachment: true });
    await thread('Cuotas viejas', { folder: 'TRASH' });
    expect(await subjects('q=cuotas')).toEqual(['Cuotas 2026']);
    expect(await subjects('q=de:clubnorte')).toEqual(['Cuotas 2026']);
    expect(await subjects('q=asunto:asamblea')).toEqual(['Convocatoria asamblea']);
    expect(await subjects('q=adjunto')).toEqual(['Convocatoria asamblea']);
    expect(await subjects('q=de:rotary adjunto')).toEqual(['Convocatoria asamblea']);
    expect(await subjects('q=de:clubnorte adjunto')).toEqual([]);
  });

  it('drafts: saved by id, per person, listed, restored in the thread, deleted', async () => {
    const t = await thread('Hilo');
    const id = 'draft-0000000000000001';
    await http()
      .put(`/correo-api/drafts/${id}`)
      .set('Authorization', facu)
      .send({ mailboxId: box, to: ['A@Example.org'], subject: 'Nuevo', text: 'borrador 1' })
      .expect(200);
    await http()
      .put(`/correo-api/drafts/${id}`)
      .set('Authorization', facu)
      .send({ mailboxId: box, to: ['a@example.org'], subject: 'Nuevo', text: 'borrador 2' })
      .expect(200);
    await http()
      .put('/correo-api/drafts/draft-0000000000000002')
      .set('Authorization', facu)
      .send({ mailboxId: box, threadId: t, replyAll: true, text: 'respuesta a medias' })
      .expect(200);

    const drafts = await http().get(`/correo-api/mailboxes/${box}/drafts`).set('Authorization', facu).expect(200);
    expect(drafts.body).toHaveLength(2);
    expect(drafts.body.find((d: { id: string }) => d.id === id)).toMatchObject({
      to: ['a@example.org'],
      text: 'borrador 2',
    });

    const opened = await http().get(`/correo-api/threads/${t}`).set('Authorization', facu).expect(200);
    expect(opened.body.draft).toMatchObject({ replyAll: true, text: 'respuesta a medias' });

    // Someone else can neither read nor overwrite them.
    await http().get(`/correo-api/mailboxes/${box}/drafts`).set('Authorization', ana).expect(404);
    await http()
      .put(`/correo-api/drafts/${id}`)
      .set('Authorization', ana)
      .send({ mailboxId: box, text: 'x' })
      .expect(404);

    await http().delete(`/correo-api/drafts/${id}`).set('Authorization', facu).expect(204);
    expect(await prisma.draft.count()).toBe(1);
  });

  it('contacts: who the mailbox heard from or wrote to, matching the query', async () => {
    await thread('Uno', { from: 'presidencia@clubcentro.org' });
    await thread('Dos', { from: 'tesoreria@clubnorte.org', lastOut: true });
    const res = await http().get(`/correo-api/mailboxes/${box}/contacts?q=club`).set('Authorization', facu).expect(200);
    expect(res.body.map((c: { email: string }) => c.email).sort()).toEqual([
      'presidencia@clubcentro.org',
      'tesoreria@clubnorte.org',
    ]);
    const none = await http()
      .get(`/correo-api/mailboxes/${box}/contacts?q=facundo`)
      .set('Authorization', facu)
      .expect(200);
    expect(none.body.map((c: { email: string }) => c.email)).not.toContain(FACU);
  });

  it('the Papelera empties after 30 days, counted from when the thread went there', async () => {
    const old = await thread('Vieja');
    const fresh = await thread('Nueva');
    await http()
      .post('/correo-api/threads/actions')
      .set('Authorization', facu)
      .send({ threadIds: [old, fresh], folder: 'TRASH' })
      .expect(200);
    await prisma.thread.update({ where: { id: old }, data: { trashedAt: new Date(Date.now() - 31 * 86400_000) } });
    await expect(app.get(TrashService).empty()).resolves.toBe(1);
    expect(await prisma.thread.findUnique({ where: { id: old } })).toBeNull();
    expect(await prisma.thread.findUnique({ where: { id: fresh } })).not.toBeNull();
    // Restoring clears the date.
    await http()
      .post('/correo-api/threads/actions')
      .set('Authorization', facu)
      .send({ threadIds: [fresh], folder: 'INBOX' })
      .expect(200);
    expect((await prisma.thread.findUniqueOrThrow({ where: { id: fresh } })).trashedAt).toBeNull();
  });
});
