import assert from "node:assert/strict";
import test from "node:test";

const {
  isClosed,
  isoToLocalInput,
  levelLabel,
  localInputToIso,
  maintenanceWindowProblem,
  nextStates,
  stateLabel,
} = await import("../src/features/status/utils/status-labels.ts");
const { statusKeys } = await import("../src/lib/api/status/status.keys.ts");

test("status levels and states read in plain Spanish with a tone", () => {
  assert.deepEqual(levelLabel("OPERATIONAL"), {
    label: "Funciona",
    tone: "success",
  });
  assert.equal(levelLabel("MAJOR_OUTAGE").tone, "danger");
  assert.equal(levelLabel("NOPE").label, "Sin datos");
  assert.equal(stateLabel("IDENTIFIED").label, "Causa identificada");
});

test("nextStates mirrors the kernel's state machine", () => {
  assert.deepEqual(nextStates({ kind: "INCIDENT", state: "MONITORING" }), [
    "INVESTIGATING",
    "IDENTIFIED",
    "MONITORING",
    "RESOLVED",
  ]);
  assert.deepEqual(nextStates({ kind: "MAINTENANCE", state: "SCHEDULED" }), [
    "SCHEDULED",
    "IN_PROGRESS",
    "CANCELLED",
  ]);
  assert.deepEqual(nextStates({ kind: "INCIDENT", state: "RESOLVED" }), []);
  assert.equal(isClosed({ state: "CANCELLED" }), true);
  assert.equal(isClosed({ state: "IN_PROGRESS" }), false);
});

test("maintenance windows are checked before sending (24 h notice)", () => {
  const now = new Date("2026-10-05T12:00:00Z");
  const at = (h) => new Date(now.getTime() + h * 3_600_000).toISOString();
  assert.equal(maintenanceWindowProblem(at(25), at(26), now), undefined);
  assert.match(maintenanceWindowProblem(undefined, at(26), now), /Indicá/);
  assert.match(maintenanceWindowProblem(at(26), at(25), now), /posterior/);
  assert.match(maintenanceWindowProblem(at(2), at(3), now), /24 horas/);
});

test("datetime-local values round-trip through ISO", () => {
  assert.equal(localInputToIso(""), undefined);
  assert.equal(localInputToIso("not a date"), undefined);
  const iso = localInputToIso("2026-10-06T09:30");
  assert.equal(isoToLocalInput(iso), "2026-10-06T09:30");
  assert.equal(isoToLocalInput(null), "");
});

test("query keys nest under one root so a mutation refreshes everything", () => {
  assert.deepEqual(statusKeys.incidentList("open"), [
    "status",
    "incidents",
    "open",
  ]);
  assert.deepEqual(statusKeys.summary().slice(0, 1), statusKeys.all);
});
