// E12.1 — the portal's status page logic (src/lib/status.ts).
import assert from "node:assert/strict";
import test from "node:test";

const status = await import("../src/lib/status.ts");

const summary = {
  generatedAt: "2026-10-05T12:00:00.000Z",
  status: "OPERATIONAL",
  description: "Todos los sistemas funcionan con normalidad",
  components: [],
  incidents: [],
  scheduledMaintenances: [],
};

function fakeFetch(routes) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    const route = routes[url];
    if (route instanceof Error) throw route;
    if (!route) throw new Error("ECONNREFUSED");
    return {
      ok: route.status < 400,
      status: route.status,
      json: async () => route.body,
    };
  };
  return { impl, calls };
}

test("statusApiBase: production by default, overridable, no trailing slash", () => {
  assert.equal(
    status.statusApiBase({}),
    "https://api.rotaract4845.com/api/kernel/v1",
  );
  assert.equal(
    status.statusApiBase({
      PORTAL_STATUS_API_URL: "http://127.0.0.1:55901/api/kernel/v1/",
    }),
    "http://127.0.0.1:55901/api/kernel/v1",
  );
});

test("readStatus reads summary and history without caching", async () => {
  const base = "http://k/api/kernel/v1";
  const { impl, calls } = fakeFetch({
    [`${base}/status`]: { status: 200, body: summary },
    [`${base}/status/history?days=90`]: {
      status: 200,
      body: { days: 90, components: [], incidents: [] },
    },
  });
  const read = await status.readStatus(base, impl);
  assert.equal(read.ok, true);
  assert.equal(read.summary.status, "OPERATIONAL");
  assert.equal(read.history.days, 90);
  assert.ok(calls.every((c) => c.init.cache === "no-store"));
});

test("readStatus: history is optional, the summary is not", async () => {
  const base = "http://k";
  const partial = await status.readStatus(
    base,
    fakeFetch({ "http://k/status": { status: 200, body: summary } }).impl,
  );
  assert.equal(partial.ok, true);
  assert.equal(partial.history, null);
  const down = await status.readStatus(
    base,
    fakeFetch({ "http://k/status": { status: 503 } }).impl,
  );
  assert.deepEqual(down, { ok: false, reason: "La API respondió 503" });
  const unreachable = await status.readStatus(base, fakeFetch({}).impl);
  assert.deepEqual(unreachable, {
    ok: false,
    reason: "La API del kernel no responde",
  });
});

test("unreachableStatus is still a usable status document", () => {
  const body = status.unreachableStatus(
    "La API del kernel no responde",
    new Date("2026-10-05T00:00:00Z"),
  );
  assert.equal(body.status, "MAJOR_OUTAGE");
  assert.equal(body.source, "portal");
  assert.equal(body.components[0].key, "api");
  assert.match(body.description, /lo informa el portal/);
});

test("day bars: colour per level and a readable tooltip", () => {
  assert.equal(status.levelColor("OPERATIONAL"), "bg-success");
  assert.equal(status.levelColor("MAJOR_OUTAGE"), "bg-destructive");
  assert.equal(status.levelColor("UNKNOWN"), "bg-muted-foreground/25");
  assert.equal(
    status.dayTitle({
      date: "2026-10-01",
      status: "UNKNOWN",
      uptime: null,
      checks: 0,
      downMinutes: 0,
      degradedMinutes: 0,
      maintenanceMinutes: 0,
    }),
    "2026-10-01: sin mediciones",
  );
  assert.equal(
    status.dayTitle({
      date: "2026-10-02",
      status: "PARTIAL_OUTAGE",
      uptime: 99.3,
      checks: 1440,
      downMinutes: 10,
      degradedMinutes: 2,
      maintenanceMinutes: 30,
    }),
    "2026-10-02: 99.30 % · 10 min caído · 2 min lento · 30 min en mantenimiento",
  );
  assert.equal(status.formatUptime(null), "sin datos");
});

test("history lists only closed incidents, newest first", () => {
  const incident = (id, state, createdAt) => ({
    id,
    state,
    createdAt,
    updates: [],
  });
  const past = status.pastIncidents({
    incidents: [
      incident("a", "RESOLVED", "2026-09-01T00:00:00Z"),
      incident("b", "INVESTIGATING", "2026-10-01T00:00:00Z"),
      incident("c", "COMPLETED", "2026-09-20T00:00:00Z"),
    ],
  });
  assert.deepEqual(
    past.map((i) => i.id),
    ["c", "a"],
  );
  assert.deepEqual(status.pastIncidents(null), []);
});
