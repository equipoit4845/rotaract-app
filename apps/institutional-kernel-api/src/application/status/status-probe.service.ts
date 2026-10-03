import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";

import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import {
  dueMaintenanceTransition,
  maintenanceActive,
  type IncidentSnapshot,
} from "./incident-rules";
import {
  configuredComponents,
  type ConfiguredComponent,
} from "./status-components";
import {
  DEFAULT_DEGRADED_MS,
  DEFAULT_PROBE_TIMEOUT_MS,
  classifyWebhookBacklog,
  minuteBucket,
  probeHttpTargets,
  probeOidc,
  utcDay,
  withConfirmation,
  type FetchLike,
  type ProbeOutcome,
} from "./status-probes";
import { isoDay } from "./uptime";

const HOUR = 3_600_000;

/**
 * E12.1 — the worker probes every status component once a minute
 * (docs/19-operations-e12.md), records one StatusCheck per component and
 * minute (unique, so two workers never double count), folds it into the
 * day's StatusDailySummary, starts/completes announced maintenances on
 * time and expires old rows (raw checks 7 days, daily summaries 90 days).
 *
 * Runs only where jobs run (the worker). Disable with
 * KERNEL_STATUS_PROBES_ENABLED=false.
 */
@Injectable()
export class StatusProbeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StatusProbeService.name);
  private timer?: NodeJS.Timeout;
  private kickoff?: NodeJS.Timeout;
  private running = false;
  private lastPurge = 0;
  /** Test seam. */
  fetchImpl: FetchLike = (url, init) => fetch(url, init);

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    if (
      process.env.KERNEL_JOBS_ENABLED === "false" ||
      process.env.KERNEL_STATUS_PROBES_ENABLED === "false"
    )
      return;
    const interval = Number(
      process.env.KERNEL_STATUS_PROBE_INTERVAL_MS ?? 60_000,
    );
    this.timer = setInterval(() => void this.tick(), interval);
    this.timer.unref?.();
    // First round shortly after boot, so a redeploy does not leave a gap.
    this.kickoff = setTimeout(() => void this.tick(), 5_000);
    this.kickoff.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.kickoff) clearTimeout(this.kickoff);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.runOnce();
    } catch (error) {
      this.logger.warn(`Status probes failed: ${String(error)}`);
    } finally {
      this.running = false;
    }
  }

  async runOnce(
    now = new Date(),
  ): Promise<
    Array<{ component: string; outcome: ProbeOutcome; recorded: boolean }>
  > {
    await this.advanceMaintenances(now);
    const maintenances = await this.prisma.statusIncident.findMany({
      where: {
        kind: "MAINTENANCE",
        state: { in: ["SCHEDULED", "IN_PROGRESS"] },
      },
    });
    const components = configuredComponents();
    const results = await Promise.all(
      components.map(async (component) => {
        const outcome = await this.probe(component, now);
        const inMaintenance = maintenances.some(
          (m) =>
            m.components.includes(component.key) &&
            maintenanceActive(m as unknown as IncidentSnapshot, now),
        );
        const recorded = await this.record(
          component.key,
          outcome,
          inMaintenance,
          now,
        );
        return { component: component.key, outcome, recorded };
      }),
    );
    if (now.getTime() - this.lastPurge > HOUR) {
      this.lastPurge = now.getTime();
      await this.purge(now);
    }
    return results;
  }

  private probeOptions() {
    return {
      fetch: this.fetchImpl,
      timeoutMs: Number(
        process.env.KERNEL_STATUS_PROBE_TIMEOUT_MS ?? DEFAULT_PROBE_TIMEOUT_MS,
      ),
      degradedMs: Number(
        process.env.KERNEL_STATUS_DEGRADED_MS ?? DEFAULT_DEGRADED_MS,
      ),
    };
  }

  async probe(
    component: ConfiguredComponent,
    now: Date,
  ): Promise<ProbeOutcome> {
    const retryMs = Number(process.env.KERNEL_STATUS_PROBE_RETRY_MS ?? 2_000);
    switch (component.probe) {
      case "webhooks":
        return this.probeWebhooks(now);
      case "oidc":
        return withConfirmation(
          () => probeOidc(component.urls[0], this.probeOptions()),
          retryMs,
        );
      default:
        return withConfirmation(
          () => probeHttpTargets(component.urls, this.probeOptions()),
          retryMs,
        );
    }
  }

  private async probeWebhooks(now: Date): Promise<ProbeOutcome> {
    try {
      const [unfanned, overdue] = await Promise.all([
        this.prisma.outboxMessage.findFirst({
          where: { webhooksFannedOutAt: null },
          orderBy: { occurredAt: "asc" },
          select: { occurredAt: true },
        }),
        this.prisma.webhookDelivery.findFirst({
          where: {
            status: "PENDING",
            nextAttemptAt: { lte: now },
            OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
            endpoint: { status: "ENABLED", app: { status: "ACTIVE" } },
          },
          orderBy: { nextAttemptAt: "asc" },
          select: { nextAttemptAt: true },
        }),
      ]);
      return classifyWebhookBacklog(
        {
          oldestUnfannedAt: unfanned?.occurredAt ?? null,
          oldestOverdueAt: overdue?.nextAttemptAt ?? null,
        },
        now,
      );
    } catch (error) {
      return { result: "DOWN", latencyMs: null, detail: "base de datos" };
    }
  }

  /** Inserts the minute's check once and adds it to the day summary. */
  async record(
    component: string,
    outcome: ProbeOutcome,
    inMaintenance: boolean,
    now: Date,
  ): Promise<boolean> {
    const bucket = minuteBucket(now);
    const day = isoDay(utcDay(now));
    return this.prisma.$transaction(async (tx) => {
      const inserted = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO "StatusCheck" ("id", "component", "result", "latencyMs", "detail", "bucket", "inMaintenance", "checkedAt")
        VALUES (${randomUUID()}, ${component}, ${outcome.result}::"StatusCheckResult", ${outcome.latencyMs}, ${outcome.detail}, ${bucket}, ${inMaintenance}, ${now})
        ON CONFLICT ("component", "bucket") DO NOTHING
        RETURNING "id"`;
      if (inserted.length === 0) return false;
      const counted = !inMaintenance;
      const up = counted && outcome.result === "UP" ? 1 : 0;
      const degraded = counted && outcome.result === "DEGRADED" ? 1 : 0;
      const down = counted && outcome.result === "DOWN" ? 1 : 0;
      const maintenance = inMaintenance ? 1 : 0;
      const latency = outcome.latencyMs ?? 0;
      const latencyCount = outcome.latencyMs === null ? 0 : 1;
      await tx.$executeRaw`
        INSERT INTO "StatusDailySummary" ("component", "day", "total", "up", "degraded", "down", "maintenance", "latencySumMs", "latencyCount", "updatedAt")
        VALUES (${component}, ${day}::date, 1, ${up}, ${degraded}, ${down}, ${maintenance}, ${latency}, ${latencyCount}, ${now})
        ON CONFLICT ("component", "day") DO UPDATE SET
          "total" = "StatusDailySummary"."total" + 1,
          "up" = "StatusDailySummary"."up" + EXCLUDED."up",
          "degraded" = "StatusDailySummary"."degraded" + EXCLUDED."degraded",
          "down" = "StatusDailySummary"."down" + EXCLUDED."down",
          "maintenance" = "StatusDailySummary"."maintenance" + EXCLUDED."maintenance",
          "latencySumMs" = "StatusDailySummary"."latencySumMs" + EXCLUDED."latencySumMs",
          "latencyCount" = "StatusDailySummary"."latencyCount" + EXCLUDED."latencyCount",
          "updatedAt" = EXCLUDED."updatedAt"`;
      return true;
    });
  }

  /** Starts/completes maintenances whose window opened/closed. */
  async advanceMaintenances(now: Date): Promise<number> {
    const candidates = await this.prisma.statusIncident.findMany({
      where: {
        kind: "MAINTENANCE",
        state: { in: ["SCHEDULED", "IN_PROGRESS"] },
        scheduledStart: { lte: now },
      },
    });
    let changed = 0;
    for (const m of candidates) {
      const due = dueMaintenanceTransition(
        m as unknown as IncidentSnapshot,
        now,
      );
      if (!due) continue;
      // Conditional update: another worker may have moved it already.
      const updated = await this.prisma.statusIncident.updateMany({
        where: { id: m.id, state: m.state },
        data: {
          state: due.to,
          ...(due.to === "IN_PROGRESS" ? { startedAt: now } : {}),
          ...(due.to === "COMPLETED"
            ? { resolvedAt: now, startedAt: m.startedAt ?? m.scheduledStart }
            : {}),
        },
      });
      if (updated.count === 0) continue;
      await this.prisma.statusIncidentUpdate.create({
        data: { incidentId: m.id, state: due.to, message: due.message },
      });
      changed++;
    }
    return changed;
  }

  async purge(now: Date): Promise<{ checks: number; summaries: number }> {
    const rawDays = Number(process.env.KERNEL_STATUS_RAW_RETENTION_DAYS ?? 7);
    const historyDays = Number(process.env.KERNEL_STATUS_HISTORY_DAYS ?? 90);
    const checks = await this.prisma.statusCheck.deleteMany({
      where: {
        checkedAt: { lt: new Date(now.getTime() - rawDays * 24 * HOUR) },
      },
    });
    const summaries = await this.prisma.statusDailySummary.deleteMany({
      where: {
        day: { lt: new Date(utcDay(now).getTime() - historyDays * 24 * HOUR) },
      },
    });
    return { checks: checks.count, summaries: summaries.count };
  }
}
