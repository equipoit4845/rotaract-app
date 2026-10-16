/**
 * Mailbox lifecycle against a real Postgres (CORREO_DATABASE_URL — a
 * throwaway database, never production), with the kernel and ClickMail faked.
 */
import { createHmac } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AuthorityView } from '@mirotaract/sdk';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { KERNEL_DIRECTORY } from '../src/kernel/kernel.service';
import { MAIL_PROVIDER } from '../src/mail-provider/mail-provider';
import { MailboxesService } from '../src/mailboxes/mailboxes.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { authority, DISTRICT, FakeKernel, FakeMail } from './fakes';

process.env.CORREO_JOBS_ENABLED = 'false';
process.env.MIROTARACT_WEBHOOK_SECRET = 'whsec_test_secret_0123456789';

function sign(body: string, secret: string) {
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
  return {
    'MiRotaract-Webhook-Timestamp': ts,
    'MiRotaract-Signature': `v1=${sig}`,
    'Content-Type': 'application/json',
  };
}

describe('mailbox lifecycle (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mailboxes: MailboxesService;
  const kernel = new FakeKernel();
  const mail = new FakeMail();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(KERNEL_DIRECTORY)
      .useValue(kernel)
      .overrideProvider(MAIL_PROVIDER)
      .useValue(mail)
      .compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('correo-api');
    await app.init();
    prisma = app.get(PrismaService);
    mailboxes = app.get(MailboxesService);
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE "Draft","AuditEvent","WebhookReceipt","Attachment","Message","Thread","MailboxAssignment","Mailbox" CASCADE',
    );
    mail.addresses.clear();
    mail.senders.clear();
    kernel.people.clear();
    kernel.people.set('p-facu', {
      id: 'p-facu',
      displayName: 'Facundo Cubells',
      firstName: 'Facundo Matías',
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
    kernel.people.set('p-ana2', {
      id: 'p-ana2',
      displayName: 'Ana Pérez',
      firstName: 'Ana',
      lastName: 'Perez',
      updatedAt: '',
    });
    kernel.current = [];
  });

  afterAll(async () => {
    await app.close();
  });

  it('an RDR appointment creates the personal mailbox and the rdr@ alias, in ClickMail too', async () => {
    await expect(mailboxes.activate(authority({ appointmentId: 'a1', personId: 'p-facu' }), 'kernel')).resolves.toBe(
      'assigned',
    );

    const boxes = await prisma.mailbox.findMany({ orderBy: { kind: 'asc' } });
    expect(boxes.map((b) => [b.kind, b.address, b.status, b.clickmailSyncedStatus])).toEqual([
      ['PERSONAL', 'facundo.cubells@rotaract4845.com', 'ACTIVE', 'ACTIVE'],
      ['ROLE', 'rdr@rotaract4845.com', 'ACTIVE', 'ACTIVE'],
    ]);
    expect(mail.addressActive('facundo.cubells@rotaract4845.com')).toBe(true);
    expect(mail.senderActive('rdr@rotaract4845.com')).toBe(true);
  });

  it('is idempotent and ignores positions without a mailbox or other organizations', async () => {
    await mailboxes.activate(authority({ appointmentId: 'a1', personId: 'p-facu' }), 'kernel');
    await expect(mailboxes.activate(authority({ appointmentId: 'a1', personId: 'p-facu' }), 'reconcile')).resolves.toBe(
      'unchanged',
    );
    await expect(
      mailboxes.activate(
        authority({ appointmentId: 'a2', personId: 'p-ana', positionCode: 'DISTRICT_DIRECCION_DE_ROTAMERCH_2TVF' }),
        'kernel',
      ),
    ).resolves.toBe('ignored');
    await expect(
      mailboxes.activate(authority({ appointmentId: 'a3', personId: 'p-ana', organizationId: 'club-x' }), 'kernel'),
    ).resolves.toBe('ignored');
    expect(await prisma.mailbox.count()).toBe(2);
    expect(await prisma.mailboxAssignment.count()).toBe(2);
  });

  it('a person moving to another position keeps their personal address, which stays active', async () => {
    await mailboxes.activate(authority({ appointmentId: 'a1', personId: 'p-facu' }), 'kernel');
    await mailboxes.activate(
      authority({ appointmentId: 'it1', personId: 'p-facu', positionCode: 'DISTRICT_COMITE_IT' }),
      'kernel',
    );
    await mailboxes.end('a1', 'kernel');

    const boxes = await prisma.mailbox.findMany({ orderBy: { address: 'asc' } });
    expect(boxes.map((b) => [b.kind, b.address, b.status])).toEqual([
      ['PERSONAL', 'facundo.cubells@rotaract4845.com', 'ACTIVE'],
      ['ROLE', 'it@rotaract4845.com', 'ACTIVE'],
      ['ROLE', 'rdr@rotaract4845.com', 'ACTIVE'],
    ]);
    const held = await prisma.mailboxAssignment.findMany({ where: { status: 'ACTIVE' }, include: { mailbox: true } });
    expect(held.map((a) => [a.appointmentId, a.mailbox.address]).sort()).toEqual([
      ['it1', 'facundo.cubells@rotaract4845.com'],
      ['it1', 'it@rotaract4845.com'],
    ]);
  });

  it('two people with the same name get different addresses', async () => {
    await mailboxes.activate(
      authority({ appointmentId: 's1', personId: 'p-ana', positionCode: 'DISTRICT_SECRETARY' }),
      'kernel',
    );
    await mailboxes.activate(
      authority({ appointmentId: 't1', personId: 'p-ana2', positionCode: 'DISTRICT_TREASURER' }),
      'kernel',
    );
    const personal = await prisma.mailbox.findMany({ where: { kind: 'PERSONAL' }, orderBy: { createdAt: 'asc' } });
    expect(personal.map((m) => m.address)).toEqual(['ana.perez@rotaract4845.com', 'ana.perez2@rotaract4845.com']);
  });

  it('when the mandate ends: personal READ_ONLY and off in ClickMail; the alias keeps receiving', async () => {
    await mailboxes.activate(authority({ appointmentId: 'a1', personId: 'p-facu' }), 'kernel');
    await mailboxes.end('a1', 'kernel');

    const personal = await prisma.mailbox.findUniqueOrThrow({ where: { address: 'facundo.cubells@rotaract4845.com' } });
    expect(personal.status).toBe('READ_ONLY');
    expect(personal.closesAt!.getTime()).toBeGreaterThan(Date.now() + 29 * 86400_000);
    expect(mail.addressActive(personal.address)).toBe(false);
    expect(mail.senderActive(personal.address)).toBe(false);

    const role = await prisma.mailbox.findUniqueOrThrow({ where: { address: 'rdr@rotaract4845.com' } });
    expect(role.status).toBe('ACTIVE');
    expect(mail.addressActive(role.address)).toBe(true);
    expect(await prisma.mailboxAssignment.count({ where: { status: 'ACTIVE' } })).toBe(0);
  });

  it('the alias goes to the successor, the predecessor keeps only the personal mailbox', async () => {
    await mailboxes.activate(authority({ appointmentId: 'a1', personId: 'p-facu' }), 'kernel');
    await mailboxes.end('a1', 'kernel');
    await mailboxes.activate(authority({ appointmentId: 'a9', personId: 'p-ana', periodId: 'per-2027' }), 'kernel');

    const role = await prisma.mailbox.findUniqueOrThrow({
      where: { address: 'rdr@rotaract4845.com' },
      include: { assignments: true },
    });
    expect(role.assignments.find((a) => a.personId === 'p-facu')!.status).toBe('ENDED');
    expect(role.assignments.find((a) => a.personId === 'p-ana')!.status).toBe('ACTIVE');
  });

  it('a missed end event: the reconciliation takes the alias from the predecessor', async () => {
    await mailboxes.activate(authority({ appointmentId: 'a1', personId: 'p-facu' }), 'kernel');
    await mailboxes.activate(authority({ appointmentId: 'a9', personId: 'p-ana', periodId: 'per-2027' }), 'kernel');
    kernel.current = [authority({ appointmentId: 'a9', personId: 'p-ana', periodId: 'per-2027' })];
    await mailboxes.reconcile();

    const held = await prisma.mailboxAssignment.findMany({
      where: { status: 'ACTIVE', mailbox: { address: 'rdr@rotaract4845.com' } },
    });
    expect(held.map((a) => a.personId)).toEqual(['p-ana']);
  });

  it('everyone holding the same position shares its alias, and the reconciliation keeps it that way', async () => {
    const it1 = authority({ appointmentId: 'it1', personId: 'p-facu', positionCode: 'DISTRICT_COMITE_IT' });
    const it2 = authority({ appointmentId: 'it2', personId: 'p-ana', positionCode: 'DISTRICT_COMITE_IT' });
    await mailboxes.activate(it1, 'kernel');
    await mailboxes.activate(it2, 'kernel');
    const holders = async () =>
      (
        await prisma.mailboxAssignment.findMany({
          where: { status: 'ACTIVE', mailbox: { address: 'it@rotaract4845.com' } },
          orderBy: { personId: 'asc' },
        })
      ).map((a) => a.personId);
    expect(await holders()).toEqual(['p-ana', 'p-facu']);
    expect(await prisma.mailbox.count({ where: { address: 'it@rotaract4845.com' } })).toBe(1);

    // No flip-flop: with both still in the kernel, nothing changes.
    kernel.current = [it1, it2];
    await expect(mailboxes.reconcile()).resolves.toEqual({ assigned: 0, ended: 0 });
    await expect(mailboxes.reconcile()).resolves.toEqual({ assigned: 0, ended: 0 });
    expect(await holders()).toEqual(['p-ana', 'p-facu']);

    // One leaves: the other keeps the alias, and it stays on in ClickMail.
    await mailboxes.end('it1', 'kernel');
    expect(await holders()).toEqual(['p-ana']);
    const role = await prisma.mailbox.findUniqueOrThrow({ where: { address: 'it@rotaract4845.com' } });
    expect(role.status).toBe('ACTIVE');
    expect(mail.addressActive('it@rotaract4845.com')).toBe(true);
  });

  it('re-appointed to the same position: the same personal mailbox comes back to life', async () => {
    await mailboxes.activate(authority({ appointmentId: 'a1', personId: 'p-facu' }), 'kernel');
    await mailboxes.end('a1', 'kernel');
    await mailboxes.activate(authority({ appointmentId: 'a2', personId: 'p-facu', periodId: 'per-2027' }), 'kernel');

    const personal = await prisma.mailbox.findMany({ where: { kind: 'PERSONAL' } });
    expect(personal).toHaveLength(1);
    expect(personal[0].status).toBe('ACTIVE');
    expect(mail.senderActive(personal[0].address)).toBe(true);
  });

  it('the period end ends the assignment; the grace period then closes the mailbox', async () => {
    await mailboxes.activate(authority({ appointmentId: 'a1', personId: 'p-facu' }), 'kernel');
    await expect(mailboxes.expirePeriods(new Date('2027-07-01T03:05:00Z'))).resolves.toBe(1);
    expect(
      (await prisma.mailbox.findUniqueOrThrow({ where: { address: 'facundo.cubells@rotaract4845.com' } })).status,
    ).toBe('READ_ONLY');

    await expect(mailboxes.closeExpired(new Date(Date.now() + 31 * 86400_000))).resolves.toBe(1);
    expect(
      (await prisma.mailbox.findUniqueOrThrow({ where: { address: 'facundo.cubells@rotaract4845.com' } })).status,
    ).toBe('CLOSED');
  });

  it('reconcile creates what is missing and ends what the kernel no longer has', async () => {
    kernel.current = [authority({ appointmentId: 'a1', personId: 'p-facu' })];
    await expect(mailboxes.reconcile()).resolves.toEqual({ assigned: 1, ended: 0 });
    await expect(mailboxes.reconcile()).resolves.toEqual({ assigned: 0, ended: 0 });

    kernel.current = [authority({ appointmentId: 's1', personId: 'p-ana', positionCode: 'DISTRICT_SECRETARY' })];
    await expect(mailboxes.reconcile()).resolves.toEqual({ assigned: 1, ended: 1 });
  });

  it('reconcile never ends everything on an empty kernel answer', async () => {
    await mailboxes.activate(authority({ appointmentId: 'a1', personId: 'p-facu' }), 'kernel');
    kernel.current = [];
    await expect(mailboxes.reconcile()).resolves.toEqual({ assigned: 0, ended: 0 });
    expect(await prisma.mailboxAssignment.count({ where: { status: 'ACTIVE' } })).toBe(2);
  });

  it('a ClickMail failure leaves the mailbox pending; syncPending catches up', async () => {
    mail.failNext = true;
    await mailboxes.activate(authority({ appointmentId: 'a1', personId: 'p-facu' }), 'kernel');
    const pendingBefore = await prisma.mailbox.count({ where: { clickmailSyncedStatus: null } });
    expect(pendingBefore).toBe(1);
    await mailboxes.syncPending();
    expect(await prisma.mailbox.count({ where: { clickmailSyncedStatus: null } })).toBe(0);
  });

  it('without a ClickMail key mailboxes are created and wait', async () => {
    mail.configured = false;
    try {
      await mailboxes.activate(authority({ appointmentId: 'a1', personId: 'p-facu' }), 'kernel');
      expect(await prisma.mailbox.count({ where: { clickmailSyncedStatus: null } })).toBe(2);
      expect(mail.addresses.size).toBe(0);
    } finally {
      mail.configured = true;
    }
    await mailboxes.syncPending();
    expect(mail.addresses.size).toBe(2);
  });

  describe('POST /correo-api/webhooks/mirotaract', () => {
    const event = (id: string, type: string, a: AuthorityView) =>
      JSON.stringify({
        id,
        type,
        createdAt: new Date().toISOString(),
        organizationId: DISTRICT,
        data: { authority: a },
      });

    it('rejects a bad signature', async () => {
      const body = event('evt_1', 'appointment.activated.v1', authority({ appointmentId: 'a1', personId: 'p-facu' }));
      await request(app.getHttpServer())
        .post('/correo-api/webhooks/mirotaract')
        .set(sign(body, 'another-secret'))
        .send(body)
        .expect(400);
      expect(await prisma.mailbox.count()).toBe(0);
    });

    it('activates on appointment.activated.v1, ignores the retry, ends on appointment.ended.v1', async () => {
      const secret = process.env.MIROTARACT_WEBHOOK_SECRET!;
      const a = authority({ appointmentId: 'a1', personId: 'p-facu' });
      const body = event('evt_1', 'appointment.activated.v1', a);
      await request(app.getHttpServer())
        .post('/correo-api/webhooks/mirotaract')
        .set(sign(body, secret))
        .send(body)
        .expect(200);
      const again = await request(app.getHttpServer())
        .post('/correo-api/webhooks/mirotaract')
        .set(sign(body, secret))
        .send(body)
        .expect(200);
      expect(again.body).toEqual({ received: true, duplicate: true });
      expect(await prisma.mailbox.count()).toBe(2);

      const ended = event('evt_2', 'appointment.ended.v1', { ...a, status: 'ENDED' });
      await request(app.getHttpServer())
        .post('/correo-api/webhooks/mirotaract')
        .set(sign(ended, secret))
        .send(ended)
        .expect(200);
      expect(
        (await prisma.mailbox.findUniqueOrThrow({ where: { address: 'facundo.cubells@rotaract4845.com' } })).status,
      ).toBe('READ_ONLY');
    });
  });
});
