/**
 * E12.1 — the public status page (/estado) and /status.json
 * (docs/19-operations-e12.md). The portal reads the kernel's public
 * GET /status and GET /status/history at request time; when the kernel
 * does not answer, the page itself says so (the portal runs in its own
 * container, so it stays up when the API is down).
 *
 * Plain TypeScript (no enums/parameter properties): the unit tests import
 * this file with Node's type stripping.
 */
export type StatusLevel =
  | "OPERATIONAL"
  | "DEGRADED"
  | "PARTIAL_OUTAGE"
  | "MAJOR_OUTAGE"
  | "MAINTENANCE"
  | "UNKNOWN";

export type StatusIncident = {
  id: string;
  kind: "INCIDENT" | "MAINTENANCE";
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

export type StatusSummary = {
  generatedAt: string;
  status: StatusLevel;
  description: string;
  components: Array<{
    key: string;
    name: string;
    description: string;
    status: StatusLevel;
    uptime90d: number | null;
    latencyMs: number | null;
    lastCheckedAt: string | null;
  }>;
  incidents: StatusIncident[];
  scheduledMaintenances: StatusIncident[];
};

export type StatusHistory = {
  generatedAt: string;
  from: string;
  to: string;
  days: number;
  components: Array<{
    key: string;
    name: string;
    uptime: number | null;
    uptime7d: number | null;
    uptime30d: number | null;
    averageLatencyMs: number | null;
    days: Array<{
      date: string;
      status: StatusLevel;
      uptime: number | null;
      checks: number;
      downMinutes: number;
      degradedMinutes: number;
      maintenanceMinutes: number;
    }>;
  }>;
  incidents: StatusIncident[];
};

/** Kernel API base the portal server reads the status from. */
export function statusApiBase(
  env: Record<string, string | undefined> = process.env,
): string {
  return (
    env.PORTAL_STATUS_API_URL || "https://api.rotaract4845.com/api/kernel/v1"
  ).replace(/\/$/, "");
}

type FetchLike = (
  url: string,
  init: {
    cache: "no-store";
    signal: AbortSignal;
    headers: Record<string, string>;
  },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export type StatusRead =
  | { ok: true; summary: StatusSummary; history: StatusHistory | null }
  | { ok: false; reason: string };

/**
 * Reads both endpoints. The summary is required; the history is optional
 * (the bars disappear but the current state is still shown).
 */
export async function readStatus(
  base: string = statusApiBase(),
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
  timeoutMs = 5_000,
): Promise<StatusRead> {
  const get = (path: string) =>
    fetchImpl(`${base}${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: "application/json" },
    });
  try {
    const [summaryResponse, historyResponse] = await Promise.all([
      get("/status"),
      get("/status/history?days=90").catch(() => null),
    ]);
    if (!summaryResponse.ok)
      return {
        ok: false,
        reason: `La API respondió ${summaryResponse.status}`,
      };
    const summary = (await summaryResponse.json()) as StatusSummary;
    const history =
      historyResponse && historyResponse.ok
        ? ((await historyResponse.json()) as StatusHistory)
        : null;
    return { ok: true, summary, history };
  } catch {
    return { ok: false, reason: "La API del kernel no responde" };
  }
}

/** /status.json when the kernel is unreachable: still valid JSON. */
export function unreachableStatus(reason: string, now = new Date()) {
  return {
    generatedAt: now.toISOString(),
    status: "MAJOR_OUTAGE" as StatusLevel,
    description: `${reason}. Este estado lo informa el portal, no el kernel.`,
    source: "portal",
    components: [
      {
        key: "api",
        name: "API del kernel",
        status: "MAJOR_OUTAGE" as StatusLevel,
      },
    ],
    incidents: [],
    scheduledMaintenances: [],
  };
}

export const LEVEL_TEXT: Record<StatusLevel, string> = {
  OPERATIONAL: "Funciona",
  DEGRADED: "Lento",
  PARTIAL_OUTAGE: "Interrupción parcial",
  MAJOR_OUTAGE: "Caído",
  MAINTENANCE: "Mantenimiento",
  UNKNOWN: "Sin datos",
};

/** Tailwind classes per level (dot / bar colour). */
export function levelColor(level: StatusLevel): string {
  switch (level) {
    case "OPERATIONAL":
      return "bg-success";
    case "DEGRADED":
    case "PARTIAL_OUTAGE":
      return "bg-warning";
    case "MAJOR_OUTAGE":
      return "bg-destructive";
    case "MAINTENANCE":
      return "bg-primary/60";
    default:
      return "bg-muted-foreground/25";
  }
}

export const STATE_TEXT: Record<string, string> = {
  INVESTIGATING: "Investigando",
  IDENTIFIED: "Causa identificada",
  MONITORING: "En observación",
  RESOLVED: "Resuelto",
  SCHEDULED: "Programado",
  IN_PROGRESS: "En curso",
  COMPLETED: "Completado",
  CANCELLED: "Cancelado",
};

export function formatUptime(value: number | null): string {
  return value === null ? "sin datos" : `${value.toFixed(2)} %`;
}

/** Tooltip of one day bar. */
export function dayTitle(
  day: StatusHistory["components"][number]["days"][number],
): string {
  if (day.checks === 0) return `${day.date}: sin mediciones`;
  const parts = [`${day.date}: ${formatUptime(day.uptime)}`];
  if (day.downMinutes) parts.push(`${day.downMinutes} min caído`);
  if (day.degradedMinutes) parts.push(`${day.degradedMinutes} min lento`);
  if (day.maintenanceMinutes)
    parts.push(`${day.maintenanceMinutes} min en mantenimiento`);
  return parts.join(" · ");
}

const dateFormat = new Intl.DateTimeFormat("es-PY", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Asuncion",
});

export function formatInstant(iso: string | null): string {
  return iso ? `${dateFormat.format(new Date(iso))} (hora de Paraguay)` : "—";
}

/** Past incidents for the history list: closed ones, newest first. */
export function pastIncidents(history: StatusHistory | null): StatusIncident[] {
  if (!history) return [];
  return history.incidents
    .filter((i) => ["RESOLVED", "COMPLETED"].includes(i.state))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
