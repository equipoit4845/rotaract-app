/**
 * E12.1 — plain-Spanish labels for the status administration
 * (docs/19-operations-e12.md). Pure: unit-tested in test/status-labels.test.mjs.
 */
import type {
  StatusIncident,
  StatusIncidentImpact,
  StatusIncidentState,
  StatusLevel,
} from "@/lib/api";

type Tone = "neutral" | "info" | "success" | "warning" | "danger";

export const COMPONENT_LABELS: Record<string, string> = {
  web: "Mi Rotaract (web)",
  api: "API del kernel",
  oidc: "Inicio de sesión (OIDC)",
  webhooks: "Webhooks",
  meetings: "Reuniones",
  portal: "Portal para desarrolladores",
  sandbox: "Sandbox",
};

export const COMPONENT_KEYS = Object.keys(COMPONENT_LABELS) as Array<
  StatusIncident["components"][number]
>;

const LEVELS: Record<StatusLevel, { label: string; tone: Tone }> = {
  OPERATIONAL: { label: "Funciona", tone: "success" },
  DEGRADED: { label: "Lento", tone: "warning" },
  PARTIAL_OUTAGE: { label: "Interrupción parcial", tone: "warning" },
  MAJOR_OUTAGE: { label: "Caído", tone: "danger" },
  MAINTENANCE: { label: "En mantenimiento", tone: "info" },
  UNKNOWN: { label: "Sin datos", tone: "neutral" },
};

export function levelLabel(level: StatusLevel): { label: string; tone: Tone } {
  return LEVELS[level] ?? LEVELS.UNKNOWN;
}

const STATES: Record<StatusIncidentState, { label: string; tone: Tone }> = {
  INVESTIGATING: { label: "Investigando", tone: "danger" },
  IDENTIFIED: { label: "Causa identificada", tone: "warning" },
  MONITORING: { label: "En observación", tone: "info" },
  RESOLVED: { label: "Resuelto", tone: "success" },
  SCHEDULED: { label: "Programado", tone: "info" },
  IN_PROGRESS: { label: "En curso", tone: "warning" },
  COMPLETED: { label: "Completado", tone: "success" },
  CANCELLED: { label: "Cancelado", tone: "neutral" },
};

export function stateLabel(state: StatusIncidentState): {
  label: string;
  tone: Tone;
} {
  return STATES[state];
}

export const IMPACT_OPTIONS: Array<{
  value: Exclude<StatusIncidentImpact, "MAINTENANCE">;
  label: string;
  hint: string;
}> = [
  {
    value: "MINOR",
    label: "Leve",
    hint: "Funciona, pero lento o con fallas aisladas.",
  },
  {
    value: "MAJOR",
    label: "Parcial",
    hint: "Una parte importante no funciona.",
  },
  { value: "CRITICAL", label: "Total", hint: "No funciona para nadie." },
];

export function impactLabel(impact: StatusIncidentImpact): string {
  if (impact === "MAINTENANCE") return "Mantenimiento";
  return IMPACT_OPTIONS.find((o) => o.value === impact)?.label ?? impact;
}

/** States the next update may move to (mirrors the kernel's rules). */
export function nextStates(
  incident: Pick<StatusIncident, "kind" | "state">,
): StatusIncidentState[] {
  switch (incident.state) {
    case "INVESTIGATING":
    case "IDENTIFIED":
    case "MONITORING":
      return ["INVESTIGATING", "IDENTIFIED", "MONITORING", "RESOLVED"];
    case "SCHEDULED":
      return ["SCHEDULED", "IN_PROGRESS", "CANCELLED"];
    case "IN_PROGRESS":
      return ["IN_PROGRESS", "COMPLETED"];
    default:
      return [];
  }
}

export function isClosed(incident: Pick<StatusIncident, "state">): boolean {
  return ["RESOLVED", "COMPLETED", "CANCELLED"].includes(incident.state);
}

/** `<input type="datetime-local">` value (local time) → ISO instant. */
export function localInputToIso(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** ISO instant → `<input type="datetime-local">` value in local time. */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Problems of a maintenance window, checked before sending. */
export function maintenanceWindowProblem(
  start: string | undefined,
  end: string | undefined,
  now: Date,
  noticeHours = 24,
): string | undefined {
  if (!start || !end) return "Indicá cuándo empieza y cuándo termina.";
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (e <= s) return "El fin tiene que ser posterior al inicio.";
  if (s < now.getTime() + noticeHours * 3_600_000)
    return `Los mantenimientos se anuncian con al menos ${noticeHours} horas de anticipación. Si es urgente, abrí un incidente.`;
  return undefined;
}

const dateFormat = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatInstant(iso: string | null | undefined): string {
  if (!iso) return "—";
  return dateFormat.format(new Date(iso));
}
