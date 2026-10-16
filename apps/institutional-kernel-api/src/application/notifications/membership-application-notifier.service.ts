import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import {
  APPLICATION_APPROVED,
  APPLICATION_EMAIL_EVENTS,
  APPLICATION_REJECTED,
  APPLICATION_SUBMITTED,
  approvedEmail,
  rejectedEmail,
  submittedEmail,
  type Recipient,
} from "./membership-application-emails";
import { EmailMessage, NotificationService } from "./notification.service";

const BATCH = 20;
/** 30 s, 1 min, 2 min … ≈ 8.5 h after the event, then given up. */
const MAX_ATTEMPTS = 11;
const PRESIDENT_ROLE = "CLUB_PRESIDENT";
/** Told instead when a club has no presidency, so a request is never lost. */
const FALLBACK_ROLE = "DISTRICT_COMITE_IT";

type Tx = Prisma.TransactionClient;
type PersonWithAccount = {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
  primaryEmail: string | null;
  account: { email: string; status: string } | null;
};

function displayName(person: PersonWithAccount): string {
  return person.displayName || `${person.firstName} ${person.lastName}`.trim();
}

function recipient(person: PersonWithAccount): Recipient | null {
  const email =
    person.account && person.account.status !== "DISABLED"
      ? person.account.email
      : person.primaryEmail;
  return email
    ? { personId: person.id, email, name: person.firstName || displayName(person) }
    : null;
}

const personSelect = {
  id: true,
  firstName: true,
  lastName: true,
  displayName: true,
  primaryEmail: true,
  account: { select: { email: true, status: true } },
} as const;

/**
 * Emails for the membership-application events of the Outbox
 * (docs/10-club-onboarding-flow.md, "Avisos"):
 *
 * - `submitted` → the club presidency (CLUB_PRESIDENT holders of that club);
 *   if the club has none, Comité IT of the district.
 * - `approved` / `rejected` → the applicant.
 *
 * Runs in the worker (KERNEL_JOBS_ENABLED). Each Outbox row is claimed with
 * FOR UPDATE SKIP LOCKED and marked `emailsNotifiedAt` once every email
 * went out; a refused send is retried with backoff. Every email carries an
 * idempotency key, so a retry never duplicates the ones already sent.
 */
@Injectable()
export class MembershipApplicationNotifierService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(
    MembershipApplicationNotifierService.name,
  );
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  onModuleInit(): void {
    if (
      process.env.KERNEL_JOBS_ENABLED === "false" ||
      process.env.KERNEL_APPLICATION_EMAILS_ENABLED === "false"
    )
      return;
    this.timer = setInterval(
      () => void this.tick(),
      Number(process.env.KERNEL_APPLICATION_EMAILS_INTERVAL_MS ?? 15_000),
    );
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.runOnce();
    } catch (error) {
      this.logger.error(error);
    } finally {
      this.running = false;
    }
  }

  async runOnce(): Promise<{ handled: number; failed: number }> {
    return this.prisma.$transaction(
      async (tx) => {
        const claimed = await tx.$queryRaw<
          Array<{
            id: string;
            eventType: string;
            aggregateId: string;
            payload: unknown;
          }>
        >`
          SELECT id, "eventType", "aggregateId", payload FROM "OutboxMessage"
          WHERE "emailsNotifiedAt" IS NULL
            AND "eventType" IN (${Prisma.join(APPLICATION_EMAIL_EVENTS)})
            AND "emailAttempts" < ${MAX_ATTEMPTS}
            AND "occurredAt" + interval '30 seconds' * (power(2, "emailAttempts") - 1)
              <= (now() AT TIME ZONE 'UTC')
          ORDER BY "occurredAt" ASC, id ASC
          LIMIT ${BATCH}
          FOR UPDATE SKIP LOCKED`;
        let handled = 0;
        let failed = 0;
        for (const message of claimed) {
          let delivered = true;
          for (const email of await this.emailsFor(tx, message)) {
            if (!(await this.notifications.sendEmail(email))) delivered = false;
          }
          await tx.outboxMessage.update({
            where: { id: message.id },
            data: {
              emailAttempts: { increment: 1 },
              ...(delivered ? { emailsNotifiedAt: new Date() } : {}),
            },
          });
          if (delivered) handled++;
          else {
            failed++;
            this.logger.warn(
              `Application email for outbox ${message.id} will be retried`,
            );
          }
        }
        return { handled, failed };
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
  }

  private async emailsFor(
    tx: Tx,
    message: { eventType: string; aggregateId: string; payload: unknown },
  ): Promise<EmailMessage[]> {
    const payload = (message.payload ?? {}) as Record<string, unknown>;
    const applicationId =
      typeof payload.applicationId === "string"
        ? payload.applicationId
        : message.aggregateId;
    const application = await tx.membershipApplication.findUnique({
      where: { id: applicationId },
      include: {
        organization: { select: { id: true, name: true } },
        requester: { select: personSelect },
      },
    });
    if (!application) return [];
    const clubName = application.organization.name;
    if (message.eventType === APPLICATION_SUBMITTED) {
      // Only a request still waiting for review is worth an email.
      if (application.status !== "SUBMITTED") return [];
      let fallback = false;
      let reviewers = await this.roleHolders(
        tx,
        PRESIDENT_ROLE,
        application.organizationId,
      );
      if (reviewers.length === 0) {
        fallback = true;
        reviewers = await this.roleHolders(tx, FALLBACK_ROLE);
        this.logger.warn(
          `Club ${application.organizationId} has no presidency; application ${applicationId} goes to ${FALLBACK_ROLE}`,
        );
      }
      return reviewers.map((reviewer) =>
        submittedEmail({
          applicationId,
          recipient: reviewer,
          requesterName: displayName(application.requester),
          clubName,
          message: application.message,
          fallback,
        }),
      );
    }
    const applicant = recipient(application.requester);
    if (!applicant) return [];
    if (message.eventType === APPLICATION_APPROVED)
      return [approvedEmail({ applicationId, recipient: applicant, clubName })];
    if (message.eventType === APPLICATION_REJECTED)
      return [
        rejectedEmail({
          applicationId,
          recipient: applicant,
          clubName,
          reason:
            application.rejectionReason ??
            (typeof payload.rejectionReason === "string"
              ? payload.rejectionReason
              : null),
        }),
      ];
    return [];
  }

  /** People holding `roleCode` right now (for one organization, if given). */
  private async roleHolders(
    tx: Tx,
    roleCode: string,
    organizationId?: string,
  ): Promise<Recipient[]> {
    const now = new Date();
    const assignments = await tx.roleAssignment.findMany({
      where: {
        roleDefinition: { code: roleCode },
        effect: "ALLOW",
        revokedAt: null,
        validFrom: { lte: now },
        OR: [{ validUntil: null }, { validUntil: { gt: now } }],
        ...(organizationId ? { organizationId } : {}),
      },
      select: { person: { select: personSelect } },
      orderBy: { createdAt: "asc" },
    });
    const seen = new Set<string>();
    const recipients: Recipient[] = [];
    for (const { person } of assignments) {
      const target = recipient(person);
      if (!target || seen.has(target.personId)) continue;
      seen.add(target.personId);
      recipients.push(target);
    }
    return recipients;
  }
}
