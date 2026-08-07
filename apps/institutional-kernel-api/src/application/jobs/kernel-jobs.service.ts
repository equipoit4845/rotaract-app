import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";

import { KernelService } from "../kernel/kernel.service";
import { CommandExecutorService } from "../shared/command-executor.service";
import { OutboxPublisherService } from "../../infrastructure/events/outbox-publisher.service";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

/** Idempotent maintenance worker. PostgreSQL advisory locks guarantee one runner across API replicas. */
@Injectable()
export class KernelJobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KernelJobsService.name);
  private timer?: NodeJS.Timeout;
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxPublisherService,
    private readonly kernel: KernelService,
    private readonly commands: CommandExecutorService,
  ) {}
  onModuleInit(): void {
    if (process.env.KERNEL_JOBS_ENABLED !== "false")
      this.timer = setInterval(
        () => void this.runDue().catch((error) => this.logger.error(error)),
        Number(process.env.KERNEL_JOBS_INTERVAL_MS ?? 60_000),
      );
  }
  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
  private async locked<T>(
    name: string,
    work: () => Promise<T>,
  ): Promise<T | undefined> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ acquired: boolean }>
      >`SELECT pg_try_advisory_xact_lock(hashtext(${name})) AS acquired`;
      if (!rows[0]?.acquired) return undefined;
      return work();
    });
  }
  async runDue(now = new Date()): Promise<void> {
    await this.locked("kernel-jobs", async () => {
      await this.expireTemporalState(now);
      await this.activateDuePeriods(now);
      await this.transitionDueAppointments(now);
      await this.publishOutbox();
    });
  }
  async expireTemporalState(now = new Date()): Promise<{
    applications: number;
    transfers: number;
    tokens: number;
    invitations: number;
    messages: number;
  }> {
    const applications = await this.prisma.membershipApplication.findMany({
      where: { status: "SUBMITTED", expiresAt: { lte: now } },
      select: { id: true },
    });
    const transfers = await this.prisma.membershipTransfer.findMany({
      where: {
        status: {
          in: ["REQUESTED", "ACCEPTED_BY_DESTINATION", "CONFIRMED_BY_ORIGIN"],
        },
        expiresAt: { lte: now },
      },
      select: { id: true },
    });
    for (const row of applications)
      await this.kernel.transitionApplication(
        row.id,
        "EXPIRED",
        {},
        this.commands.systemContext("ExpireMembershipApplication"),
      );
    for (const row of transfers)
      await this.kernel.transitionTransfer(
        row.id,
        "EXPIRED",
        {},
        this.commands.systemContext("ExpireMembershipTransfer"),
      );
    const [verification, reset, invitations, messages, sessions] =
      await this.prisma.$transaction((tx) =>
        Promise.all([
          tx.emailVerificationToken.deleteMany({
            where: { expiresAt: { lte: now } },
          }),
          tx.passwordResetToken.deleteMany({
            where: { expiresAt: { lte: now } },
          }),
          tx.accountInvitation.updateMany({
            where: { status: "PENDING", expiresAt: { lte: now } },
            data: { status: "EXPIRED" },
          }),
          tx.idempotencyKey.deleteMany({ where: { expiresAt: { lte: now } } }),
          tx.accountSession.deleteMany({
            where: { revokedAt: { not: null }, expiresAt: { lte: now } },
          }),
        ]),
      );
    return {
      applications: applications.length,
      transfers: transfers.length,
      tokens: verification.count + reset.count + sessions.count,
      invitations: invitations.count,
      messages: messages.count,
    };
  }
  private async activateDuePeriods(now: Date): Promise<void> {
    const scheduled = await this.prisma.institutionalPeriod.findMany({
      where: { status: "SCHEDULED", startDate: { lte: now } },
      select: { id: true },
    });
    for (const period of scheduled)
      await this.kernel.transitionPeriod(
        period.id,
        "ACTIVE",
        this.commands.systemContext("ActivateScheduledPeriod"),
      );
    const active = await this.prisma.institutionalPeriod.findMany({
      where: { status: "ACTIVE", endDate: { lt: now } },
      select: { id: true },
    });
    for (const period of active)
      await this.kernel.transitionPeriod(
        period.id,
        "CLOSED",
        this.commands.systemContext("CloseExpiredPeriod"),
      );
  }
  private async transitionDueAppointments(now: Date): Promise<void> {
    const elected = await this.prisma.appointment.findMany({
      where: {
        status: "ELECTED",
        startsAt: { lte: now },
        period: { status: "ACTIVE" },
      },
      select: { id: true },
    });
    for (const appointment of elected)
      await this.kernel.transitionAppointment(
        appointment.id,
        "ACTIVE",
        {},
        this.commands.systemContext("ActivateScheduledAppointment"),
      );
    const active = await this.prisma.appointment.findMany({
      where: { status: "ACTIVE", endsAt: { lte: now } },
      select: { id: true },
    });
    for (const appointment of active)
      await this.kernel.transitionAppointment(
        appointment.id,
        "ENDED",
        {},
        this.commands.systemContext("EndExpiredAppointment"),
      );
  }
  async publishOutbox(): Promise<number> {
    return this.outbox.publishPending();
  }
}
