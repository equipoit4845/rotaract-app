/**
 * E12.1 — uptime and displayed status (docs/19-operations-e12.md).
 *
 * Each check stands for one minute of a component. Uptime is the share of
 * checks that answered (UP or DEGRADED) among the checks that count: those
 * inside an announced maintenance of that component are left out, as on
 * any public status page. A window without countable checks has no uptime
 * (null), never 100 %.
 */
export type ComponentStatus =
  | "OPERATIONAL"
  | "DEGRADED"
  | "PARTIAL_OUTAGE"
  | "MAJOR_OUTAGE"
  | "MAINTENANCE"
  | "UNKNOWN";

export type DaySummary = {
  day: Date;
  total: number;
  up: number;
  degraded: number;
  down: number;
  maintenance: number;
  latencySumMs: number;
  latencyCount: number;
};

const SEVERITY: Record<Exclude<ComponentStatus, "UNKNOWN">, number> = {
  OPERATIONAL: 0,
  MAINTENANCE: 1,
  DEGRADED: 2,
  PARTIAL_OUTAGE: 3,
  MAJOR_OUTAGE: 4,
};

export function severity(status: ComponentStatus): number {
  return status === "UNKNOWN" ? -1 : SEVERITY[status];
}

export function mostSevere(statuses: ComponentStatus[]): ComponentStatus {
  const known = statuses.filter((s) => s !== "UNKNOWN");
  if (known.length === 0) return "UNKNOWN";
  return known.reduce((a, b) => (severity(b) > severity(a) ? b : a));
}

/** Ratio in [0, 1], or null when nothing counts. */
export function uptimeRatio(
  rows: Array<Pick<DaySummary, "total" | "up" | "degraded" | "maintenance">>,
): number | null {
  let counted = 0;
  let answered = 0;
  for (const row of rows) {
    // A check inside a maintenance is only counted in `maintenance` (and
    // `total`), never in up/degraded/down: it is neither up nor down.
    counted += Math.max(0, row.total - row.maintenance);
    answered += Math.max(0, row.up + row.degraded);
  }
  if (counted <= 0) return null;
  return Math.min(1, Math.max(0, answered / counted));
}

/**
 * Percentage with two decimals, rounded DOWN: one failed minute in 90 days
 * is 99.99 %, never a rounded-up 100 %.
 */
export function uptimePercent(ratio: number | null): number | null {
  if (ratio === null) return null;
  if (ratio >= 1) return 100;
  return Math.floor(ratio * 10_000) / 100;
}

export const MAJOR_OUTAGE_MINUTES = 30;

/** Colour of one day bar: from the minutes it was down or degraded. */
export function dayStatus(day: DaySummary | null): ComponentStatus {
  if (!day || day.total - day.maintenance <= 0)
    return day && day.maintenance > 0 ? "MAINTENANCE" : "UNKNOWN";
  if (day.down >= MAJOR_OUTAGE_MINUTES) return "MAJOR_OUTAGE";
  if (day.down > 0) return "PARTIAL_OUTAGE";
  if (day.degraded > 0) return "DEGRADED";
  return "OPERATIONAL";
}

export function averageLatency(
  rows: Array<Pick<DaySummary, "latencySumMs" | "latencyCount">>,
): number | null {
  let sum = 0;
  let count = 0;
  for (const row of rows) {
    sum += row.latencySumMs;
    count += row.latencyCount;
  }
  return count > 0 ? Math.round(sum / count) : null;
}

/** ISO date (YYYY-MM-DD) of a UTC day. */
export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * The last `days` UTC days ending today, oldest first, each with its
 * summary or null (no checks that day).
 */
export function fillDays(
  rows: DaySummary[],
  today: Date,
  days: number,
): Array<{ date: string; summary: DaySummary | null }> {
  const byDay = new Map(rows.map((row) => [isoDay(row.day), row]));
  const result: Array<{ date: string; summary: DaySummary | null }> = [];
  const end = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  for (let i = days - 1; i >= 0; i--) {
    const date = isoDay(new Date(end - i * 86_400_000));
    result.push({ date, summary: byDay.get(date) ?? null });
  }
  return result;
}

export type IncidentImpact = "MINOR" | "MAJOR" | "CRITICAL" | "MAINTENANCE";

export function impactStatus(impact: IncidentImpact): ComponentStatus {
  switch (impact) {
    case "MINOR":
      return "DEGRADED";
    case "MAJOR":
      return "PARTIAL_OUTAGE";
    case "CRITICAL":
      return "MAJOR_OUTAGE";
    case "MAINTENANCE":
      return "MAINTENANCE";
  }
}

export function probeStatus(
  latest: { result: "UP" | "DEGRADED" | "DOWN"; checkedAt: Date } | null,
  now: Date,
  staleMs: number,
): ComponentStatus {
  if (!latest || now.getTime() - latest.checkedAt.getTime() > staleMs)
    return "UNKNOWN";
  if (latest.result === "UP") return "OPERATIONAL";
  if (latest.result === "DEGRADED") return "DEGRADED";
  return "MAJOR_OUTAGE";
}

/**
 * What the page shows for one component right now: the probe, unless an
 * announced maintenance is in progress (expected downtime), and never less
 * severe than an open incident on it.
 */
export function displayedStatus(input: {
  probe: ComponentStatus;
  inMaintenance: boolean;
  openIncidentImpacts: IncidentImpact[];
}): ComponentStatus {
  const base = input.inMaintenance ? "MAINTENANCE" : input.probe;
  const incident = mostSevere(input.openIncidentImpacts.map(impactStatus));
  if (incident === "UNKNOWN") return base;
  return severity(incident) > severity(base) ? incident : base;
}
