import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AuthorityView } from '@mirotaract/sdk';
import { AuditService } from '../audit/audit.service';
import { graceDays, MAILBOX_POSITIONS, positionConfig } from '../config';
import { AccessService } from '../kernel/access.service';
import { KERNEL_DIRECTORY, type KernelDirectory } from '../kernel/kernel.service';
import { MAIL_PROVIDER, type MailProvider } from '../mail-provider/mail-provider';
import type { Mailbox, Prisma } from '../prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { addressOf, baseLocalPart, freeLocalPart, MAIL_DOMAIN } from './address';

const DAY_MS = 24 * 60 * 60 * 1000;

export type ActivateResult = 'ignored' | 'unchanged' | 'assigned';

/**
 * Mailbox lifecycle (plan §Ciclo de vida):
 *
 * - an ACTIVE appointment to a position with a mailbox gives its holder a
 *   PERSONAL mailbox (nombre.apellido@) and the position's ROLE alias;
 * - when the appointment ends — or its period does — the personal mailbox
 *   turns READ_ONLY and closes after `graceDays`; the alias stays ACTIVE,
 *   keeps receiving and goes to the next holder with its history;
 * - ClickMail follows the database: `sync` switches the receiving address
 *   and the sender on or off. Without a ClickMail key mailboxes are created
 *   all the same and wait (`clickmailSyncedStatus` ≠ `status`).
 *
 * Every database change runs under one transaction-level advisory lock, so a
 * webhook and a reconciliation never race on the same mailbox.
 */
@Injectable()
export class MailboxesService {
  private readonly logger = new Logger(MailboxesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: AccessService,
    @Inject(KERNEL_DIRECTORY) private readonly kernel: KernelDirectory,
    @Inject(MAIL_PROVIDER) private readonly mail: MailProvider,
  ) {}

  private locked<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('correo.mailboxes'))`;
      return fn(tx);
    });
  }

  /** `appointment.activated.v1`, or an ACTIVE authority found by the reconciliation. */
  async activate(authority: AuthorityView, source: 'kernel' | 'reconcile'): Promise<ActivateResult> {
    const cfg = positionConfig(authority.positionCode);
    if (!cfg || authority.status !== 'ACTIVE' || authority.organizationId !== this.kernel.districtId) return 'ignored';

    const current = await this.prisma.mailboxAssignment.count({
      where: { appointmentId: authority.appointmentId, status: 'ACTIVE' },
    });
    if (current >= 2) return 'unchanged';

    const personId = authority.person.id;
    const person = await this.kernel.person(personId);
    const startsAt = authority.startsAt ? new Date(authority.startsAt) : new Date();

    const touched = await this.locked(async (tx) => {
      // Personal mailbox: reuse the one this person had for this position
      // (re-elected, or back within the grace period), else a new address.
      const previous = await tx.mailboxAssignment.findFirst({
        where: { personId, mailbox: { kind: 'PERSONAL', positionCode: cfg.positionCode } },
        orderBy: { startsAt: 'desc' },
        include: { mailbox: true },
      });
      let personal: Mailbox;
      if (previous) {
        personal = await tx.mailbox.update({
          where: { id: previous.mailbox.id },
          data: { status: 'ACTIVE', closesAt: null },
        });
      } else {
        const base =
          baseLocalPart(person.firstName, person.lastName) ?? `autoridad.${personId.slice(-6).toLowerCase()}`;
        const localPart = await freeLocalPart(
          base,
          async (l) => (await tx.mailbox.count({ where: { address: addressOf(l) } })) > 0,
        );
        personal = await tx.mailbox.create({
          data: {
            kind: 'PERSONAL',
            address: addressOf(localPart),
            displayName: person.displayName || `${person.firstName} ${person.lastName}`.trim(),
            positionCode: cfg.positionCode,
          },
        });
      }

      // Role alias: one per position, handed from holder to holder.
      const roleAddress = addressOf(cfg.alias);
      const role =
        (await tx.mailbox.findUnique({ where: { address: roleAddress } })) ??
        (await tx.mailbox.create({
          data: {
            kind: 'ROLE',
            address: roleAddress,
            displayName: `${cfg.label} · Distrito 4845`,
            positionCode: cfg.positionCode,
          },
        }));
      if (role.status !== 'ACTIVE')
        await tx.mailbox.update({ where: { id: role.id }, data: { status: 'ACTIVE', closesAt: null } });
      const handedOver = await tx.mailboxAssignment.updateMany({
        where: { mailboxId: role.id, status: 'ACTIVE', appointmentId: { not: authority.appointmentId } },
        data: { status: 'ENDED', endsAt: new Date() },
      });

      for (const mailbox of [personal, role]) {
        await tx.mailboxAssignment.upsert({
          where: { mailboxId_appointmentId: { mailboxId: mailbox.id, appointmentId: authority.appointmentId } },
          create: {
            mailboxId: mailbox.id,
            personId,
            appointmentId: authority.appointmentId,
            periodId: authority.periodId,
            startsAt,
          },
          update: { status: 'ACTIVE', endsAt: null },
        });
        await this.audit.record(
          'mailbox.assigned',
          {
            mailboxId: mailbox.id,
            meta: {
              appointmentId: authority.appointmentId,
              kind: mailbox.kind,
              source,
              handedOver: mailbox === role ? handedOver.count : 0,
            },
          },
          tx,
        );
      }
      return [personal.id, role.id];
    });

    this.access.forget(personId);
    await this.syncMany(touched);
    return 'assigned';
  }

  /** `appointment.ended.v1`, the end of its period, or the reconciliation. */
  async end(appointmentId: string, reason: 'kernel' | 'period' | 'reconcile'): Promise<number> {
    const result = await this.locked(async (tx) => {
      const assignments = await tx.mailboxAssignment.findMany({
        where: { appointmentId, status: 'ACTIVE' },
        include: { mailbox: true },
      });
      const touched: string[] = [];
      for (const a of assignments) {
        await tx.mailboxAssignment.update({ where: { id: a.id }, data: { status: 'ENDED', endsAt: new Date() } });
        touched.push(a.mailboxId);
        if (a.mailbox.kind === 'PERSONAL') {
          const stillHeld = await tx.mailboxAssignment.count({ where: { mailboxId: a.mailboxId, status: 'ACTIVE' } });
          if (!stillHeld) {
            await tx.mailbox.update({
              where: { id: a.mailboxId },
              data: { status: 'READ_ONLY', closesAt: new Date(Date.now() + graceDays() * DAY_MS) },
            });
          }
        }
        await this.audit.record(
          'mailbox.unassigned',
          { mailboxId: a.mailboxId, meta: { appointmentId, reason, kind: a.mailbox.kind } },
          tx,
        );
      }
      return { touched, personIds: [...new Set(assignments.map((a) => a.personId))] };
    });
    result.personIds.forEach((p) => this.access.forget(p));
    await this.syncMany(result.touched);
    return result.touched.length;
  }

  /** Ends the assignments whose period is over (no public event announces it). */
  async expirePeriods(now = new Date()): Promise<number> {
    const ended = (await this.kernel.periods())
      .filter((p) => new Date(p.endDate).getTime() < now.getTime())
      .map((p) => p.id);
    if (!ended.length) return 0;
    const due = await this.prisma.mailboxAssignment.findMany({
      where: { status: 'ACTIVE', periodId: { in: ended } },
      select: { appointmentId: true },
      distinct: ['appointmentId'],
    });
    for (const { appointmentId } of due) await this.end(appointmentId, 'period');
    return due.length;
  }

  /** READ_ONLY mailboxes past their grace period become CLOSED. */
  async closeExpired(now = new Date()): Promise<number> {
    const due = await this.prisma.mailbox.findMany({
      where: { status: 'READ_ONLY', closesAt: { lte: now } },
      select: { id: true },
    });
    for (const { id } of due) {
      await this.locked(async (tx) => {
        await tx.mailbox.update({ where: { id }, data: { status: 'CLOSED', closesAt: null } });
        await this.audit.record('mailbox.closed', { mailboxId: id, meta: { reason: 'grace_period' } }, tx);
      });
    }
    await this.syncMany(due.map((d) => d.id));
    return due.length;
  }

  /**
   * Compares the district's current authorities with the assignments: gives
   * mailboxes to whoever is missing one and ends what the kernel no longer
   * has. A kernel answer with none of the mailbox positions filled while
   * assignments exist is treated as suspicious and nothing is ended.
   */
  async reconcile(): Promise<{ assigned: number; ended: number }> {
    const codes = new Set(MAILBOX_POSITIONS.map((p) => p.positionCode));
    const authorities = (await this.kernel.authorities()).filter((a) => codes.has(a.positionCode));
    let assigned = 0;
    for (const authority of authorities) {
      if ((await this.activate(authority, 'reconcile')) === 'assigned') assigned++;
    }
    const live = new Set(authorities.map((a) => a.appointmentId));
    const stale = await this.prisma.mailboxAssignment.findMany({
      where: { status: 'ACTIVE', appointmentId: { notIn: [...live] } },
      select: { appointmentId: true },
      distinct: ['appointmentId'],
    });
    if (!authorities.length && stale.length) {
      this.logger.warn(
        `reconcile: kernel lists no authority with a mailbox; ${stale.length} assignment(s) left as they are`,
      );
      return { assigned, ended: 0 };
    }
    for (const { appointmentId } of stale) await this.end(appointmentId, 'reconcile');
    return { assigned, ended: stale.length };
  }

  /** Mailboxes ClickMail does not reflect yet (no key before, or a failed call). */
  async syncPending(): Promise<number> {
    if (!this.mail.configured) return 0;
    const pending = await this.prisma.mailbox.findMany({
      select: { id: true, status: true, clickmailSyncedStatus: true },
    });
    const ids = pending.filter((m) => m.clickmailSyncedStatus !== m.status).map((m) => m.id);
    await this.syncMany(ids);
    return ids.length;
  }

  private async syncMany(ids: string[]) {
    for (const id of new Set(ids)) await this.sync(id);
  }

  /** Puts ClickMail in step with the mailbox: ACTIVE = address and sender on, otherwise off. */
  async sync(mailboxId: string): Promise<boolean> {
    if (!this.mail.configured) return false;
    const mailbox = await this.prisma.mailbox.findUniqueOrThrow({ where: { id: mailboxId } });
    if (mailbox.clickmailSyncedStatus === mailbox.status) return true;
    try {
      const active = mailbox.status === 'ACTIVE';
      let { clickmailAddressId, clickmailSenderId } = mailbox;
      if (active) {
        const [localPart] = mailbox.address.split('@');
        clickmailAddressId ??= await this.mail.ensureAddress({
          localPart,
          host: MAIL_DOMAIN,
          name: mailbox.displayName,
        });
        clickmailSenderId ??= await this.mail.ensureSender({ email: mailbox.address, name: mailbox.displayName });
      }
      if (clickmailAddressId) await this.mail.setAddressActive(clickmailAddressId, active);
      if (clickmailSenderId) await this.mail.setSenderActive(clickmailSenderId, active);
      await this.prisma.mailbox.update({
        where: { id: mailbox.id },
        data: { clickmailAddressId, clickmailSenderId, clickmailSyncedStatus: mailbox.status },
      });
      await this.audit.record('mailbox.clickmail_synced', { mailboxId: mailbox.id, meta: { status: mailbox.status } });
      return true;
    } catch (error) {
      this.logger.warn(
        `clickmail sync failed for mailbox ${mailbox.id}: ${error instanceof Error ? error.name : 'error'}`,
      );
      return false;
    }
  }
}
