import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  Prisma,
  StatusIncident,
  StatusIncidentUpdate,
} from "@prisma/client";

import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import {
  IncidentRuleError,
  isOpen,
  isUpcomingMaintenance,
  maintenanceActive,
  rulesConfig,
  validateIncidentPatch,
  validateNewIncident,
  validateUpdate,
  type IncidentImpact,
  type IncidentSnapshot,
} from "./incident-rules";
import { STATUS_COMPONENTS, configuredComponents } from "./status-components";
import { utcDay } from "./status-probes";
import {
  averageLatency,
  dayStatus,
  displayedStatus,
  fillDays,
  mostSevere,
  probeStatus,
  uptimePercent,
  uptimeRatio,
  type ComponentStatus,
  type DaySummary,
} from "./uptime";

const DAY = 86_400_000;
/** A component whose last check is older than this shows UNKNOWN. */
const STALE_MS = 5 * 60_000;
const MAX_HISTORY_DAYS = 90;

type IncidentWithUpdates = StatusIncident & { updates: StatusIncidentUpdate[] };

export type PublicIncident = {
  id: string;
  kind: string;
  title: string;
  impact: string;
  state: string;
  components: string[];
  scheduledStart: string | null;
  scheduledEnd: string | null;
  startedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  updates: Array<{
    id: string;
    state: string;
    message: string;
    createdAt: string;
  }>;
};

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** Public shape: never the author (no personal data). */
export function toPublicIncident(
  incident: IncidentWithUpdates,
): PublicIncident {
  return {
    id: incident.id,
    kind: incident.kind,
    title: incident.title,
    impact: incident.impact,
    state: incident.state,
    components: incident.components,
    scheduledStart: iso(incident.scheduledStart),
    scheduledEnd: iso(incident.scheduledEnd),
    startedAt: iso(incident.startedAt),
    resolvedAt: iso(incident.resolvedAt),
    createdAt: incident.createdAt.toISOString(),
    updatedAt: incident.updatedAt.toISOString(),
    updates: [...incident.updates]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((u) => ({
        id: u.id,
        state: u.state,
        message: u.message,
        createdAt: u.createdAt.toISOString(),
      })),
  };
}

const OVERALL_TEXT: Record<ComponentStatus, string> = {
  OPERATIONAL: "Todos los sistemas funcionan con normalidad",
  DEGRADED: "Algunos sistemas funcionan con lentitud",
  PARTIAL_OUTAGE: "Hay una interrupción parcial",
  MAJOR_OUTAGE: "Hay una interrupción importante",
  MAINTENANCE: "Mantenimiento en curso",
  UNKNOWN: "Todavía no hay mediciones",
};

function toSummary(row: {
  day: Date;
  total: number;
  up: number;
  degraded: number;
  down: number;
  maintenance: number;
  latencySumMs: bigint | number;
  latencyCount: number;
}): DaySummary {
  return { ...row, latencySumMs: Number(row.latencySumMs) };
}

function invalid(error: unknown): never {
  if (error instanceof IncidentRuleError)
    throw new BadRequestException({
      message: error.message,
      code: "KERNEL_STATUS_INVALID",
      errors: error.errors,
    });
  throw error;
}

/**
 * E12.1 — public status (GET /status, GET /status/history) and the
 * incident/maintenance administration (docs/19-operations-e12.md).
 */
@Injectable()
export class StatusService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Components to show: those the worker measured in the last day, in
   * catalog order. Before the first round (fresh install) the ones this
   * process would probe, as UNKNOWN.
   */
  private async visibleComponents(now: Date) {
    const recent = await this.prisma.statusCheck.findMany({
      where: { checkedAt: { gte: new Date(now.getTime() - DAY) } },
      distinct: ["component"],
      select: { component: true },
    });
    const measured = new Set(recent.map((r) => r.component));
    const list = STATUS_COMPONENTS.filter((c) => measured.has(c.key));
    return list.length
      ? list
      : STATUS_COMPONENTS.filter((c) =>
          configuredComponents().some((k) => k.key === c.key),
        );
  }

  private async latestChecks(now: Date) {
    const rows = await this.prisma.$queryRaw<
      Array<{
        component: string;
        result: "UP" | "DEGRADED" | "DOWN";
        latencyMs: number | null;
        checkedAt: Date;
      }>
    >`
      SELECT DISTINCT ON ("component") "component", "result"::text AS "result", "latencyMs", "checkedAt"
      FROM "StatusCheck"
      WHERE "checkedAt" >= ${new Date(now.getTime() - DAY)}
      ORDER BY "component", "checkedAt" DESC`;
    return new Map(rows.map((r) => [r.component, r]));
  }

  private async summaries(since: Date) {
    const rows = await this.prisma.statusDailySummary.findMany({
      where: { day: { gte: since } },
      orderBy: { day: "asc" },
    });
    const byComponent = new Map<string, DaySummary[]>();
    for (const row of rows) {
      const list = byComponent.get(row.component) ?? [];
      list.push(toSummary(row));
      byComponent.set(row.component, list);
    }
    return byComponent;
  }

  async getStatus(now = new Date()) {
    const [components, latest, summaries, incidents] = await Promise.all([
      this.visibleComponents(now),
      this.latestChecks(now),
      this.summaries(
        new Date(utcDay(now).getTime() - (MAX_HISTORY_DAYS - 1) * DAY),
      ),
      this.prisma.statusIncident.findMany({
        where: {
          state: {
            in: [
              "INVESTIGATING",
              "IDENTIFIED",
              "MONITORING",
              "SCHEDULED",
              "IN_PROGRESS",
            ],
          },
        },
        include: { updates: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    const snapshots = incidents as unknown as Array<
      IncidentWithUpdates & IncidentSnapshot
    >;
    const openIncidents = snapshots.filter(
      (i) => i.kind === "INCIDENT" && isOpen(i),
    );
    const activeMaintenances = snapshots.filter((i) =>
      maintenanceActive(i, now),
    );
    const upcoming = snapshots
      .filter((i) => isUpcomingMaintenance(i, now))
      .sort(
        (a, b) => a.scheduledStart!.getTime() - b.scheduledStart!.getTime(),
      );

    const rows = components.map((component) => {
      const check = latest.get(component.key) ?? null;
      const status = displayedStatus({
        probe: probeStatus(check, now, STALE_MS),
        inMaintenance: activeMaintenances.some((m) =>
          m.components.includes(component.key),
        ),
        openIncidentImpacts: openIncidents
          .filter((i) => i.components.includes(component.key))
          .map((i) => i.impact as IncidentImpact),
      });
      const days = summaries.get(component.key) ?? [];
      return {
        key: component.key,
        name: component.name,
        description: component.description,
        status,
        uptime90d: uptimePercent(uptimeRatio(days)),
        latencyMs: check?.latencyMs ?? null,
        lastCheckedAt: check ? check.checkedAt.toISOString() : null,
      };
    });
    const overall = mostSevere(rows.map((r) => r.status));
    return {
      generatedAt: now.toISOString(),
      status: overall,
      description: OVERALL_TEXT[overall],
      components: rows,
      incidents: [...openIncidents, ...activeMaintenances].map(
        toPublicIncident,
      ),
      scheduledMaintenances: upcoming.map(toPublicIncident),
    };
  }

  async getHistory(query: Record<string, unknown>, now = new Date()) {
    let days = MAX_HISTORY_DAYS;
    if (query.days !== undefined && query.days !== "") {
      days = Number(query.days);
      if (!Number.isInteger(days) || days < 1 || days > MAX_HISTORY_DAYS)
        throw new BadRequestException(
          `days debe ser un entero entre 1 y ${MAX_HISTORY_DAYS}`,
        );
    }
    const today = utcDay(now);
    const from = new Date(today.getTime() - (days - 1) * DAY);
    const [components, summaries, incidents] = await Promise.all([
      this.visibleComponents(now),
      this.summaries(from),
      this.prisma.statusIncident.findMany({
        where: {
          state: { not: "CANCELLED" },
          OR: [
            { createdAt: { gte: from } },
            { resolvedAt: { gte: from } },
            { resolvedAt: null },
          ],
        },
        include: { updates: true },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
    ]);
    const window = (list: DaySummary[], n: number) =>
      list.filter((d) => d.day.getTime() > today.getTime() - n * DAY);
    return {
      generatedAt: now.toISOString(),
      from: from.toISOString().slice(0, 10),
      to: today.toISOString().slice(0, 10),
      days,
      components: components.map((component) => {
        const list = summaries.get(component.key) ?? [];
        return {
          key: component.key,
          name: component.name,
          uptime: uptimePercent(uptimeRatio(list)),
          uptime7d: uptimePercent(uptimeRatio(window(list, 7))),
          uptime30d: uptimePercent(uptimeRatio(window(list, 30))),
          averageLatencyMs: averageLatency(list),
          days: fillDays(list, today, days).map(({ date, summary }) => ({
            date,
            status: dayStatus(summary),
            uptime: summary ? uptimePercent(uptimeRatio([summary])) : null,
            checks: summary?.total ?? 0,
            downMinutes: summary?.down ?? 0,
            degradedMinutes: summary?.degraded ?? 0,
            maintenanceMinutes: summary?.maintenance ?? 0,
          })),
        };
      }),
      incidents: incidents
        // Upcoming maintenances belong to GET /status, not to the history.
        .filter(
          (i) => !isUpcomingMaintenance(i as unknown as IncidentSnapshot, now),
        )
        .map((i) => toPublicIncident(i)),
    };
  }

  // --- administration (kernel.status.manage) ------------------------------

  async listIncidents(query: Record<string, unknown>) {
    const filter = query.state ?? "all";
    if (!["open", "closed", "all"].includes(String(filter)))
      throw new BadRequestException("state debe ser open, closed o all");
    const where: Prisma.StatusIncidentWhereInput =
      filter === "open"
        ? {
            state: {
              in: [
                "INVESTIGATING",
                "IDENTIFIED",
                "MONITORING",
                "SCHEDULED",
                "IN_PROGRESS",
              ],
            },
          }
        : filter === "closed"
          ? { state: { in: ["RESOLVED", "COMPLETED", "CANCELLED"] } }
          : {};
    const incidents = await this.prisma.statusIncident.findMany({
      where,
      include: { updates: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return incidents.map(toPublicIncident);
  }

  async create(input: unknown, personId: string | undefined, now = new Date()) {
    let incident;
    try {
      incident = validateNewIncident(
        (input ?? {}) as Record<string, unknown>,
        now,
        rulesConfig(),
      );
    } catch (error) {
      invalid(error);
    }
    const created = await this.prisma.statusIncident.create({
      data: {
        kind: incident.kind,
        title: incident.title,
        impact: incident.impact,
        state: incident.state,
        components: incident.components,
        scheduledStart: incident.scheduledStart,
        scheduledEnd: incident.scheduledEnd,
        startedAt: incident.startedAt,
        createdById: personId ?? null,
        updates: {
          create: {
            state: incident.state,
            message: incident.message,
            createdById: personId ?? null,
          },
        },
      },
      include: { updates: true },
    });
    return toPublicIncident(created);
  }

  private async load(incidentId: string) {
    const incident = await this.prisma.statusIncident.findUnique({
      where: { id: incidentId },
      include: { updates: true },
    });
    if (!incident) throw new NotFoundException("Incidente no encontrado");
    return incident;
  }

  async update(incidentId: string, input: unknown, now = new Date()) {
    const current = await this.load(incidentId);
    let patch;
    try {
      patch = validateIncidentPatch(
        current as unknown as IncidentSnapshot,
        (input ?? {}) as Record<string, unknown>,
        now,
        rulesConfig(),
      );
    } catch (error) {
      invalid(error);
    }
    const updated = await this.prisma.statusIncident.update({
      where: { id: incidentId },
      data: patch,
      include: { updates: true },
    });
    return toPublicIncident(updated);
  }

  async addUpdate(
    incidentId: string,
    input: unknown,
    personId: string | undefined,
    now = new Date(),
  ) {
    const current = await this.load(incidentId);
    let change;
    try {
      change = validateUpdate(
        current as unknown as IncidentSnapshot,
        (input ?? {}) as Record<string, unknown>,
        now,
      );
    } catch (error) {
      invalid(error);
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      // Conditional on the state we validated against (concurrent edits).
      const moved = await tx.statusIncident.updateMany({
        where: { id: incidentId, state: current.state },
        data: {
          state: change.state,
          ...(change.startedAt ? { startedAt: change.startedAt } : {}),
          ...(change.resolvedAt ? { resolvedAt: change.resolvedAt } : {}),
        },
      });
      if (moved.count === 0)
        throw new BadRequestException({
          message:
            "El incidente cambió mientras lo editabas; recargá y probá de nuevo",
          code: "KERNEL_STATUS_CONFLICT",
        });
      await tx.statusIncidentUpdate.create({
        data: {
          incidentId,
          state: change.state,
          message: change.message,
          createdById: personId ?? null,
        },
      });
      return tx.statusIncident.findUniqueOrThrow({
        where: { id: incidentId },
        include: { updates: true },
      });
    });
    return toPublicIncident(updated);
  }
}
