import {
  IncidentRuleError,
  canTransition,
  dueMaintenanceTransition,
  isUpcomingMaintenance,
  maintenanceActive,
  rulesConfig,
  validateIncidentPatch,
  validateNewIncident,
  validateUpdate,
  type IncidentSnapshot,
} from "./incident-rules";

const now = new Date("2026-10-05T12:00:00Z");
const config = { noticeHours: 24, maxHours: 72 };
const hours = (h: number) =>
  new Date(now.getTime() + h * 3_600_000).toISOString();

function errorsOf(fn: () => unknown): string[] {
  try {
    fn();
  } catch (error) {
    if (error instanceof IncidentRuleError)
      return error.errors.map((e) => `${e.path} ${e.message}`);
    throw error;
  }
  throw new Error("expected IncidentRuleError");
}

function snapshot(partial: Partial<IncidentSnapshot>): IncidentSnapshot {
  return {
    kind: "INCIDENT",
    state: "INVESTIGATING",
    impact: "MAJOR",
    components: ["api"],
    scheduledStart: null,
    scheduledEnd: null,
    startedAt: now,
    resolvedAt: null,
    ...partial,
  };
}

describe("incident rules (E12.1)", () => {
  it("opens an incident in INVESTIGATING with MAJOR impact by default", () => {
    const incident = validateNewIncident(
      {
        kind: "INCIDENT",
        title: "  La API responde con errores ",
        components: ["api", "oidc", "api"],
        message: "Investigando.",
      },
      now,
      config,
    );
    expect(incident).toMatchObject({
      kind: "INCIDENT",
      title: "La API responde con errores",
      components: ["api", "oidc"],
      impact: "MAJOR",
      state: "INVESTIGATING",
      startedAt: now,
      scheduledStart: null,
    });
  });

  it("rejects bad incidents with every reason in Spanish", () => {
    const errors = errorsOf(() =>
      validateNewIncident(
        {
          kind: "INCIDENT",
          title: "",
          components: ["api", "dns"],
          impact: "MAINTENANCE",
          state: "RESOLVED",
        },
        now,
        config,
      ),
    );
    expect(errors).toEqual([
      "/title El título es obligatorio",
      "/message El mensaje es obligatorio",
      "/components Componente desconocido: dns",
      "/impact impact tiene que ser MINOR, MAJOR o CRITICAL",
      "/state Un incidente empieza en INVESTIGATING, IDENTIFIED o MONITORING",
    ]);
    expect(
      errorsOf(() => validateNewIncident({ kind: "OUTAGE" }, now, config)),
    ).toEqual(["/kind kind tiene que ser INCIDENT o MAINTENANCE"]);
    expect(
      errorsOf(() =>
        validateNewIncident(
          {
            kind: "INCIDENT",
            title: "x".repeat(141),
            components: [],
            message: "m",
            scheduledStart: hours(30),
          },
          now,
          config,
        ),
      ),
    ).toEqual([
      "/title El título puede tener hasta 140 caracteres",
      "/components Elegí al menos un componente afectado",
      "/scheduledStart Sólo los mantenimientos tienen una ventana programada",
    ]);
  });

  it("maintenances must be announced in advance (24 h by default)", () => {
    const ok = validateNewIncident(
      {
        kind: "MAINTENANCE",
        title: "Actualización de la base",
        components: ["api", "web"],
        message: "Cortes breves.",
        scheduledStart: hours(25),
        scheduledEnd: hours(26),
      },
      now,
      config,
    );
    expect(ok).toMatchObject({
      state: "SCHEDULED",
      impact: "MAINTENANCE",
      startedAt: null,
    });

    expect(
      errorsOf(() =>
        validateNewIncident(
          {
            kind: "MAINTENANCE",
            title: "t",
            components: ["api"],
            message: "m",
            scheduledStart: hours(2),
            scheduledEnd: hours(3),
          },
          now,
          config,
        ),
      ),
    ).toEqual([
      "/scheduledStart Los mantenimientos se anuncian con al menos 24 horas de anticipación. Si es urgente, abrí un incidente.",
    ]);
  });

  it("maintenance window: end after start, at most 72 h, not in the past, ISO dates", () => {
    const base = {
      kind: "MAINTENANCE",
      title: "t",
      components: ["api"],
      message: "m",
    };
    expect(
      errorsOf(() =>
        validateNewIncident(
          { ...base, scheduledStart: hours(30), scheduledEnd: hours(29) },
          now,
          config,
        ),
      ),
    ).toEqual([
      "/scheduledEnd El fin del mantenimiento tiene que ser posterior al inicio",
    ]);
    expect(
      errorsOf(() =>
        validateNewIncident(
          { ...base, scheduledStart: hours(30), scheduledEnd: hours(103) },
          now,
          config,
        ),
      ),
    ).toEqual(["/scheduledEnd Un mantenimiento puede durar hasta 72 horas"]);
    expect(
      errorsOf(() =>
        validateNewIncident(
          { ...base, scheduledStart: hours(-1), scheduledEnd: hours(1) },
          now,
          config,
        ),
      ),
    ).toEqual([
      "/scheduledStart El inicio del mantenimiento no puede estar en el pasado",
    ]);
    expect(
      errorsOf(() =>
        validateNewIncident(
          { ...base, scheduledStart: "mañana", impact: "MAJOR" },
          now,
          config,
        ),
      ),
    ).toEqual([
      "/impact Un mantenimiento no lleva impacto: se muestra como mantenimiento",
      "/scheduledStart El inicio tiene que ser una fecha y hora ISO 8601",
      "/scheduledEnd El fin tiene que ser una fecha y hora ISO 8601",
    ]);
  });

  it("notice and maximum come from the environment, with safe fallbacks", () => {
    expect(rulesConfig({})).toEqual({ noticeHours: 24, maxHours: 72 });
    expect(
      rulesConfig({
        KERNEL_STATUS_MAINTENANCE_NOTICE_HOURS: "48",
        KERNEL_STATUS_MAINTENANCE_MAX_HOURS: "6",
      }),
    ).toEqual({
      noticeHours: 48,
      maxHours: 6,
    });
    expect(
      rulesConfig({
        KERNEL_STATUS_MAINTENANCE_NOTICE_HOURS: "-1",
        KERNEL_STATUS_MAINTENANCE_MAX_HOURS: "x",
      }),
    ).toEqual({
      noticeHours: 24,
      maxHours: 72,
    });
    const urgentOk = validateNewIncident(
      {
        kind: "MAINTENANCE",
        title: "t",
        components: ["api"],
        message: "m",
        scheduledStart: hours(1),
        scheduledEnd: hours(2),
      },
      now,
      { noticeHours: 0, maxHours: 72 },
    );
    expect(urgentOk.state).toBe("SCHEDULED");
  });

  it("state machine: incidents end in RESOLVED (final), maintenances in COMPLETED/CANCELLED", () => {
    expect(canTransition("INVESTIGATING", "IDENTIFIED")).toBe(true);
    expect(canTransition("MONITORING", "INVESTIGATING")).toBe(true);
    expect(canTransition("IDENTIFIED", "RESOLVED")).toBe(true);
    expect(canTransition("RESOLVED", "INVESTIGATING")).toBe(false);
    expect(canTransition("INVESTIGATING", "IN_PROGRESS")).toBe(false);
    expect(canTransition("SCHEDULED", "IN_PROGRESS")).toBe(true);
    expect(canTransition("SCHEDULED", "CANCELLED")).toBe(true);
    expect(canTransition("SCHEDULED", "COMPLETED")).toBe(false);
    expect(canTransition("IN_PROGRESS", "COMPLETED")).toBe(true);
    expect(canTransition("IN_PROGRESS", "CANCELLED")).toBe(false);
    expect(canTransition("COMPLETED", "IN_PROGRESS")).toBe(false);
  });

  it("updates need a message; resolving stamps resolvedAt, starting stamps startedAt", () => {
    const resolved = validateUpdate(
      snapshot({}),
      { state: "RESOLVED", message: "Listo." },
      now,
    );
    expect(resolved).toEqual({
      state: "RESOLVED",
      message: "Listo.",
      resolvedAt: now,
    });
    const note = validateUpdate(
      snapshot({ state: "IDENTIFIED" }),
      { message: "Seguimos." },
      now,
    );
    expect(note).toEqual({ state: "IDENTIFIED", message: "Seguimos." });
    const started = validateUpdate(
      snapshot({ kind: "MAINTENANCE", state: "SCHEDULED", startedAt: null }),
      { state: "IN_PROGRESS", message: "Empezamos." },
      now,
    );
    expect(started.startedAt).toEqual(now);
    expect(
      errorsOf(() => validateUpdate(snapshot({}), { state: "RESOLVED" }, now)),
    ).toEqual(["/message El mensaje es obligatorio"]);
    expect(
      errorsOf(() =>
        validateUpdate(
          snapshot({ state: "RESOLVED" }),
          { state: "INVESTIGATING", message: "volvió" },
          now,
        ),
      ),
    ).toEqual([
      "/state Está cerrado: si el problema volvió, abrí un incidente nuevo",
    ]);
    expect(
      errorsOf(() =>
        validateUpdate(snapshot({}), { state: "COMPLETED", message: "m" }, now),
      ),
    ).toEqual(["/state No se puede pasar de INVESTIGATING a COMPLETED"]);
    expect(
      errorsOf(() =>
        validateUpdate(snapshot({}), { state: "BROKEN", message: "m" }, now),
      ),
    ).toEqual(["/state Estado desconocido: BROKEN"]);
  });

  it("patch: closed ones only accept a title fix; impact only for incidents", () => {
    const closed = snapshot({ state: "RESOLVED" });
    expect(
      validateIncidentPatch(
        closed,
        { title: "Corte de la API (corregido)" },
        now,
        config,
      ),
    ).toEqual({
      title: "Corte de la API (corregido)",
    });
    expect(
      errorsOf(() =>
        validateIncidentPatch(closed, { components: ["web"] }, now, config),
      ),
    ).toEqual([
      "/state Un incidente o mantenimiento cerrado sólo admite corregir el título",
    ]);
    expect(
      validateIncidentPatch(
        snapshot({}),
        { impact: "CRITICAL", components: ["api", "web"] },
        now,
        config,
      ),
    ).toEqual({
      impact: "CRITICAL",
      components: ["api", "web"],
    });
    const maintenance = snapshot({
      kind: "MAINTENANCE",
      state: "SCHEDULED",
      impact: "MAINTENANCE",
      scheduledStart: new Date(hours(48)),
      scheduledEnd: new Date(hours(50)),
    });
    expect(
      errorsOf(() =>
        validateIncidentPatch(maintenance, { impact: "MINOR" }, now, config),
      ),
    ).toEqual(["/impact Un mantenimiento no lleva impacto"]);
    expect(
      errorsOf(() =>
        validateIncidentPatch(
          snapshot({}),
          { scheduledStart: hours(30) },
          now,
          config,
        ),
      ),
    ).toEqual([
      "/scheduledStart Sólo los mantenimientos tienen una ventana programada",
    ]);
  });

  it("patch: postponing a maintenance is fine, moving it earlier needs notice, started ones are fixed", () => {
    const maintenance = snapshot({
      kind: "MAINTENANCE",
      state: "SCHEDULED",
      impact: "MAINTENANCE",
      scheduledStart: new Date(hours(30)),
      scheduledEnd: new Date(hours(32)),
    });
    expect(
      validateIncidentPatch(
        maintenance,
        { scheduledStart: hours(31), scheduledEnd: hours(33) },
        now,
        config,
      ),
    ).toEqual({
      scheduledStart: new Date(hours(31)),
      scheduledEnd: new Date(hours(33)),
    });
    // Postponed even though "now + 24 h" passed: allowed (it is later).
    const soon = {
      ...maintenance,
      scheduledStart: new Date(hours(2)),
      scheduledEnd: new Date(hours(3)),
    };
    expect(
      validateIncidentPatch(
        soon,
        { scheduledStart: hours(4), scheduledEnd: hours(5) },
        now,
        config,
      ).scheduledStart,
    ).toEqual(new Date(hours(4)));
    expect(
      errorsOf(() =>
        validateIncidentPatch(
          maintenance,
          { scheduledStart: hours(3) },
          now,
          config,
        ),
      ),
    ).toEqual([
      "/scheduledStart Los mantenimientos se anuncian con al menos 24 horas de anticipación. Si es urgente, abrí un incidente.",
    ]);
    expect(
      errorsOf(() =>
        validateIncidentPatch(
          { ...maintenance, state: "IN_PROGRESS" },
          { scheduledEnd: hours(40) },
          now,
          config,
        ),
      ),
    ).toEqual([
      "/scheduledStart La ventana sólo se puede cambiar antes de que empiece el mantenimiento",
    ]);
  });

  it("maintenance timing: active inside its window, upcoming before, auto start/complete", () => {
    const m = snapshot({
      kind: "MAINTENANCE",
      state: "SCHEDULED",
      impact: "MAINTENANCE",
      scheduledStart: new Date(hours(1)),
      scheduledEnd: new Date(hours(3)),
    });
    expect(isUpcomingMaintenance(m, now)).toBe(true);
    expect(maintenanceActive(m, now)).toBe(false);
    expect(dueMaintenanceTransition(m, now)).toBeNull();
    const inside = new Date(hours(2));
    expect(maintenanceActive(m, inside)).toBe(true);
    expect(dueMaintenanceTransition(m, inside)).toEqual({
      to: "IN_PROGRESS",
      message: "Comenzó el mantenimiento programado.",
    });
    const after = new Date(hours(4));
    expect(maintenanceActive(m, after)).toBe(false);
    expect(dueMaintenanceTransition(m, after)?.to).toBe("COMPLETED");
    expect(
      dueMaintenanceTransition({ ...m, state: "IN_PROGRESS" }, after)?.to,
    ).toBe("COMPLETED");
    expect(maintenanceActive({ ...m, state: "IN_PROGRESS" }, after)).toBe(true);
    expect(
      dueMaintenanceTransition({ ...m, state: "CANCELLED" }, inside),
    ).toBeNull();
    expect(maintenanceActive(snapshot({}), inside)).toBe(false);
  });
});
