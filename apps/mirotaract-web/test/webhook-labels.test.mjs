import assert from "node:assert/strict";
import test from "node:test";

const {
  describeAttempt,
  endpointState,
  eventTitle,
  subscribableEvents,
  webhookUrlProblem,
} = await import("../src/features/developer-apps/utils/webhook-labels.ts");
const { webhookKeys } =
  await import("../src/lib/api/webhooks/webhooks.keys.ts");

test("webhookUrlProblem explains what is wrong in plain words", () => {
  assert.equal(webhookUrlProblem("https://miapp.org/api/webhooks"), undefined);
  assert.match(webhookUrlProblem(""), /Escribí/);
  assert.match(webhookUrlProblem("miapp.org"), /https:\/\//);
  assert.match(webhookUrlProblem("ftp://miapp.org"), /https:\/\//);
  assert.match(webhookUrlProblem("https://u:p@miapp.org"), /usuario/);
});

test("endpointState tells manual and automatic deactivation apart", () => {
  const base = { status: "ENABLED", disabledReason: null, failingSince: null };
  assert.equal(endpointState(base).label, "Activo");
  assert.equal(
    endpointState({ ...base, failingSince: "2026-10-02T00:00:00Z" }).tone,
    "warning",
  );
  assert.equal(
    endpointState({ ...base, status: "DISABLED", disabledReason: "MANUAL" })
      .label,
    "Desactivado",
  );
  assert.equal(
    endpointState({
      ...base,
      status: "DISABLED",
      disabledReason: "AUTO_FAILURES",
    }).label,
    "Desactivado por fallas",
  );
});

test("describeAttempt and the catalog helpers", () => {
  assert.equal(describeAttempt({ attempts: 0 }), "Todavía no se envió");
  assert.equal(
    describeAttempt({
      attempts: 1,
      lastResponseStatus: 200,
      lastLatencyMs: 87,
    }),
    "Respondió 200 en 87 ms",
  );
  assert.equal(
    describeAttempt({ attempts: 2, lastError: "Sin respuesta en 10 s" }),
    "Sin respuesta en 10 s",
  );
  const catalog = [
    { type: "membership.activated.v1", title: "Socio activado" },
    { type: "ping.v1", title: "Prueba" },
  ];
  assert.deepEqual(
    subscribableEvents(catalog).map((e) => e.type),
    ["membership.activated.v1"],
  );
  assert.equal(
    eventTitle(catalog, "membership.activated.v1"),
    "Socio activado",
  );
  assert.equal(eventTitle(catalog, "x.v1"), "x.v1");
});

test("webhookKeys: deliveries are scoped per endpoint", () => {
  assert.notDeepEqual(
    webhookKeys.deliveries("app", "e1"),
    webhookKeys.deliveries("app", "e2"),
  );
  assert.deepEqual(webhookKeys.list("app").slice(0, 1), webhookKeys.all);
});
