/**
 * E12.1 — rules for incidents and maintenances (docs/19-operations-e12.md).
 * Pure: the service validates with these and persists the result.
 *
 * - An INCIDENT is opened when something already broke: it starts in
 *   INVESTIGATING (or IDENTIFIED/MONITORING), moves freely between those
 *   open states and ends in RESOLVED, which is final (a relapse is a new
 *   incident, so the history stays honest).
 * - A MAINTENANCE is announced IN ADVANCE: its window must start at least
 *   `noticeHours` from now (24 h by default) and last at most `maxHours`.
 *   SCHEDULED → IN_PROGRESS → COMPLETED, or SCHEDULED → CANCELLED. The
 *   worker starts and completes it on its own when the window opens and
 *   closes, so a forgotten click never leaves the page wrong.
 * - Every state change carries a public message. Authors are never public.
 */
import {
  isStatusComponentKey,
  type StatusComponentKey,
} from "./status-components";

export type IncidentKind = "INCIDENT" | "MAINTENANCE";
export type IncidentImpact = "MINOR" | "MAJOR" | "CRITICAL" | "MAINTENANCE";
export type IncidentState =
  | "INVESTIGATING"
  | "IDENTIFIED"
  | "MONITORING"
  | "RESOLVED"
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

export const OPEN_INCIDENT_STATES: IncidentState[] = [
  "INVESTIGATING",
  "IDENTIFIED",
  "MONITORING",
];
export const CLOSED_STATES: IncidentState[] = [
  "RESOLVED",
  "COMPLETED",
  "CANCELLED",
];

export type FieldError = { path: string; message: string };

export class IncidentRuleError extends Error {
  constructor(readonly errors: FieldError[]) {
    super(errors.map((e) => e.message).join(". "));
  }
}

export type IncidentRulesConfig = {
  noticeHours: number;
  maxHours: number;
};

export function rulesConfig(
  env: Record<string, string | undefined> = process.env,
): IncidentRulesConfig {
  const notice = Number(env.KERNEL_STATUS_MAINTENANCE_NOTICE_HOURS ?? 24);
  const max = Number(env.KERNEL_STATUS_MAINTENANCE_MAX_HOURS ?? 72);
  return {
    noticeHours: Number.isFinite(notice) && notice >= 0 ? notice : 24,
    maxHours: Number.isFinite(max) && max > 0 ? max : 72,
  };
}

export type IncidentSnapshot = {
  kind: IncidentKind;
  state: IncidentState;
  impact: IncidentImpact;
  components: string[];
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  startedAt: Date | null;
  resolvedAt: Date | null;
};

export type NewIncident = IncidentSnapshot & {
  title: string;
  message: string;
};

const TITLE_MAX = 140;
const MESSAGE_MAX = 2000;

function text(
  value: unknown,
  path: string,
  label: string,
  max: number,
  errors: FieldError[],
): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push({ path, message: `${label} es obligatorio` });
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    errors.push({
      path,
      message: `${label} puede tener hasta ${max} caracteres`,
    });
    return undefined;
  }
  return trimmed;
}

function components(
  value: unknown,
  errors: FieldError[],
): StatusComponentKey[] {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push({
      path: "/components",
      message: "Elegí al menos un componente afectado",
    });
    return [];
  }
  const result: StatusComponentKey[] = [];
  for (const item of value) {
    if (!isStatusComponentKey(item)) {
      errors.push({
        path: "/components",
        message: `Componente desconocido: ${String(item)}`,
      });
      continue;
    }
    if (!result.includes(item)) result.push(item);
  }
  return result;
}

function instant(
  value: unknown,
  path: string,
  label: string,
  errors: FieldError[],
): Date | undefined {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    errors.push({
      path,
      message: `${label} tiene que ser una fecha y hora ISO 8601`,
    });
    return undefined;
  }
  return new Date(value);
}

function checkWindow(
  start: Date,
  end: Date,
  now: Date,
  config: IncidentRulesConfig,
  errors: FieldError[],
  options: { requireNotice: boolean },
): void {
  if (end.getTime() <= start.getTime())
    errors.push({
      path: "/scheduledEnd",
      message: "El fin del mantenimiento tiene que ser posterior al inicio",
    });
  else if (end.getTime() - start.getTime() > config.maxHours * 3_600_000)
    errors.push({
      path: "/scheduledEnd",
      message: `Un mantenimiento puede durar hasta ${config.maxHours} horas`,
    });
  if (start.getTime() < now.getTime())
    errors.push({
      path: "/scheduledStart",
      message: "El inicio del mantenimiento no puede estar en el pasado",
    });
  else if (
    options.requireNotice &&
    start.getTime() < now.getTime() + config.noticeHours * 3_600_000
  )
    errors.push({
      path: "/scheduledStart",
      message: `Los mantenimientos se anuncian con al menos ${config.noticeHours} horas de anticipación. Si es urgente, abrí un incidente.`,
    });
}

const INCIDENT_IMPACTS: IncidentImpact[] = ["MINOR", "MAJOR", "CRITICAL"];

/** Validates POST /status/incidents. Throws IncidentRuleError. */
export function validateNewIncident(
  input: Record<string, unknown>,
  now: Date,
  config: IncidentRulesConfig,
): NewIncident {
  const errors: FieldError[] = [];
  const kind = input.kind;
  if (kind !== "INCIDENT" && kind !== "MAINTENANCE") {
    throw new IncidentRuleError([
      { path: "/kind", message: "kind tiene que ser INCIDENT o MAINTENANCE" },
    ]);
  }
  const title = text(input.title, "/title", "El título", TITLE_MAX, errors);
  const message = text(
    input.message,
    "/message",
    "El mensaje",
    MESSAGE_MAX,
    errors,
  );
  const affected = components(input.components, errors);

  if (kind === "INCIDENT") {
    const impact = (input.impact ?? "MAJOR") as IncidentImpact;
    if (!INCIDENT_IMPACTS.includes(impact))
      errors.push({
        path: "/impact",
        message: "impact tiene que ser MINOR, MAJOR o CRITICAL",
      });
    const state = (input.state ?? "INVESTIGATING") as IncidentState;
    if (!OPEN_INCIDENT_STATES.includes(state))
      errors.push({
        path: "/state",
        message:
          "Un incidente empieza en INVESTIGATING, IDENTIFIED o MONITORING",
      });
    if (input.scheduledStart !== undefined || input.scheduledEnd !== undefined)
      errors.push({
        path: "/scheduledStart",
        message: "Sólo los mantenimientos tienen una ventana programada",
      });
    if (errors.length) throw new IncidentRuleError(errors);
    return {
      kind,
      title: title!,
      message: message!,
      components: affected,
      impact,
      state,
      scheduledStart: null,
      scheduledEnd: null,
      startedAt: now,
      resolvedAt: null,
    };
  }

  if (input.impact !== undefined && input.impact !== "MAINTENANCE")
    errors.push({
      path: "/impact",
      message:
        "Un mantenimiento no lleva impacto: se muestra como mantenimiento",
    });
  if (input.state !== undefined && input.state !== "SCHEDULED")
    errors.push({
      path: "/state",
      message: "Un mantenimiento se anuncia en estado SCHEDULED",
    });
  const start = instant(
    input.scheduledStart,
    "/scheduledStart",
    "El inicio",
    errors,
  );
  const end = instant(input.scheduledEnd, "/scheduledEnd", "El fin", errors);
  if (start && end)
    checkWindow(start, end, now, config, errors, { requireNotice: true });
  if (errors.length) throw new IncidentRuleError(errors);
  return {
    kind,
    title: title!,
    message: message!,
    components: affected,
    impact: "MAINTENANCE",
    state: "SCHEDULED",
    scheduledStart: start!,
    scheduledEnd: end!,
    startedAt: null,
    resolvedAt: null,
  };
}

export type IncidentPatch = {
  title?: string;
  components?: string[];
  impact?: IncidentImpact;
  scheduledStart?: Date;
  scheduledEnd?: Date;
};

/** Validates PATCH /status/incidents/{id}. */
export function validateIncidentPatch(
  current: IncidentSnapshot,
  input: Record<string, unknown>,
  now: Date,
  config: IncidentRulesConfig,
): IncidentPatch {
  const errors: FieldError[] = [];
  const patch: IncidentPatch = {};
  const closed = CLOSED_STATES.includes(current.state);
  if (input.title !== undefined)
    patch.title = text(input.title, "/title", "El título", TITLE_MAX, errors);
  const touchesMore = [
    "components",
    "impact",
    "scheduledStart",
    "scheduledEnd",
  ].some((key) => input[key] !== undefined);
  if (closed && touchesMore) {
    throw new IncidentRuleError([
      {
        path: "/state",
        message:
          "Un incidente o mantenimiento cerrado sólo admite corregir el título",
      },
    ]);
  }
  if (input.components !== undefined)
    patch.components = components(input.components, errors);
  if (input.impact !== undefined) {
    if (current.kind !== "INCIDENT")
      errors.push({
        path: "/impact",
        message: "Un mantenimiento no lleva impacto",
      });
    else if (!INCIDENT_IMPACTS.includes(input.impact as IncidentImpact))
      errors.push({
        path: "/impact",
        message: "impact tiene que ser MINOR, MAJOR o CRITICAL",
      });
    else patch.impact = input.impact as IncidentImpact;
  }
  if (input.scheduledStart !== undefined || input.scheduledEnd !== undefined) {
    if (current.kind !== "MAINTENANCE")
      errors.push({
        path: "/scheduledStart",
        message: "Sólo los mantenimientos tienen una ventana programada",
      });
    else if (current.state !== "SCHEDULED")
      errors.push({
        path: "/scheduledStart",
        message:
          "La ventana sólo se puede cambiar antes de que empiece el mantenimiento",
      });
    else {
      const start =
        input.scheduledStart !== undefined
          ? instant(
              input.scheduledStart,
              "/scheduledStart",
              "El inicio",
              errors,
            )
          : current.scheduledStart!;
      const end =
        input.scheduledEnd !== undefined
          ? instant(input.scheduledEnd, "/scheduledEnd", "El fin", errors)
          : current.scheduledEnd!;
      if (start && end) {
        // Postponing is always fine; moving it EARLIER needs the same
        // notice as a new announcement.
        const earlier =
          current.scheduledStart !== null &&
          start.getTime() < current.scheduledStart.getTime();
        checkWindow(start, end, now, config, errors, {
          requireNotice: earlier,
        });
        patch.scheduledStart = start;
        patch.scheduledEnd = end;
      }
    }
  }
  if (errors.length) throw new IncidentRuleError(errors);
  return patch;
}

const TRANSITIONS: Record<IncidentState, IncidentState[]> = {
  INVESTIGATING: ["INVESTIGATING", "IDENTIFIED", "MONITORING", "RESOLVED"],
  IDENTIFIED: ["INVESTIGATING", "IDENTIFIED", "MONITORING", "RESOLVED"],
  MONITORING: ["INVESTIGATING", "IDENTIFIED", "MONITORING", "RESOLVED"],
  RESOLVED: [],
  SCHEDULED: ["SCHEDULED", "IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["IN_PROGRESS", "COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransition(from: IncidentState, to: IncidentState): boolean {
  return TRANSITIONS[from].includes(to);
}

export type StateChange = {
  state: IncidentState;
  message: string;
  startedAt?: Date;
  resolvedAt?: Date;
};

/** Validates POST /status/incidents/{id}/updates. */
export function validateUpdate(
  current: IncidentSnapshot,
  input: Record<string, unknown>,
  now: Date,
): StateChange {
  const errors: FieldError[] = [];
  const message = text(
    input.message,
    "/message",
    "El mensaje",
    MESSAGE_MAX,
    errors,
  );
  const state = (input.state ?? current.state) as IncidentState;
  if (!(state in TRANSITIONS))
    errors.push({
      path: "/state",
      message: `Estado desconocido: ${String(state)}`,
    });
  else if (!canTransition(current.state, state))
    errors.push({
      path: "/state",
      message: CLOSED_STATES.includes(current.state)
        ? "Está cerrado: si el problema volvió, abrí un incidente nuevo"
        : `No se puede pasar de ${current.state} a ${state}`,
    });
  if (errors.length) throw new IncidentRuleError(errors);
  const change: StateChange = { state, message: message! };
  if (state === "IN_PROGRESS" && !current.startedAt) change.startedAt = now;
  if (CLOSED_STATES.includes(state)) change.resolvedAt = now;
  return change;
}

export function isOpen(incident: Pick<IncidentSnapshot, "state">): boolean {
  return !CLOSED_STATES.includes(incident.state);
}

/** A maintenance covers `now` while in progress or inside its window. */
export function maintenanceActive(
  m: Pick<
    IncidentSnapshot,
    "kind" | "state" | "scheduledStart" | "scheduledEnd"
  >,
  now: Date,
): boolean {
  if (m.kind !== "MAINTENANCE") return false;
  if (m.state === "IN_PROGRESS") return true;
  return (
    m.state === "SCHEDULED" &&
    !!m.scheduledStart &&
    !!m.scheduledEnd &&
    m.scheduledStart.getTime() <= now.getTime() &&
    now.getTime() < m.scheduledEnd.getTime()
  );
}

export function isUpcomingMaintenance(
  m: Pick<IncidentSnapshot, "kind" | "state" | "scheduledStart">,
  now: Date,
): boolean {
  return (
    m.kind === "MAINTENANCE" &&
    m.state === "SCHEDULED" &&
    !!m.scheduledStart &&
    m.scheduledStart.getTime() > now.getTime()
  );
}

/**
 * Transitions the worker applies on its own: a SCHEDULED maintenance whose
 * window opened starts, and one whose window closed completes (directly
 * from SCHEDULED too, if the worker was down the whole window).
 */
export function dueMaintenanceTransition(
  m: Pick<
    IncidentSnapshot,
    "kind" | "state" | "scheduledStart" | "scheduledEnd"
  >,
  now: Date,
): { to: IncidentState; message: string } | null {
  if (m.kind !== "MAINTENANCE" || !m.scheduledStart || !m.scheduledEnd)
    return null;
  const t = now.getTime();
  if (
    (m.state === "SCHEDULED" || m.state === "IN_PROGRESS") &&
    t >= m.scheduledEnd.getTime()
  )
    return {
      to: "COMPLETED",
      message: "Terminó la ventana de mantenimiento programada.",
    };
  if (m.state === "SCHEDULED" && t >= m.scheduledStart.getTime())
    return {
      to: "IN_PROGRESS",
      message: "Comenzó el mantenimiento programado.",
    };
  return null;
}

/** Whether an open incident or active maintenance touches a component. */
export function affects(
  incident: Pick<IncidentSnapshot, "components">,
  component: string,
): boolean {
  return incident.components.includes(component);
}
