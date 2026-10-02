// bootstrap.ts installs jsdom's globals and must run before
// `@testing-library/react`/react-dom ever get imported.
import "./bootstrap.ts";

import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import { cleanup, fireEvent } from "@testing-library/react";
import React from "react";

import { MockBackend } from "./mock-backend.ts";
import {
  jsonResponse,
  problemResponse,
  renderWithClient,
  waitFor,
} from "./render.ts";

afterEach(cleanup);

const { tokenManager } =
  await import("../../src/lib/api/client/token-manager.ts");
const { WebhooksPanel } =
  await import("../../src/features/developer-apps/components/webhooks-panel.tsx");

const APP = {
  id: "app_1",
  clientId: "mra_0123456789abcdef0123",
  name: "Padrón del club",
  description: null,
  type: "CONFIDENTIAL",
  status: "ACTIVE",
  organizationId: "org_club",
  ownerPersonId: "per_1",
  grantTypes: ["client_credentials"],
  scopes: ["kernel.service.memberships.read"],
  redirectUris: [],
  secrets: [],
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

const CATALOG = {
  version: 1,
  signature: {
    algorithm: "HMAC-SHA256",
    signedPayload: "<t>.<body>",
    headers: {
      id: "MiRotaract-Webhook-Id",
      timestamp: "MiRotaract-Webhook-Timestamp",
      signature: "MiRotaract-Signature",
    },
    toleranceSec: 300,
  },
  envelope: {},
  events: [
    {
      type: "membership.activated.v1",
      name: "membership.activated",
      version: 1,
      title: "Socio activado",
      description: "Una membresía pasó a activa.",
      scope: "kernel.service.memberships.read",
      schema: {},
      example: {},
    },
    {
      type: "period.created.v1",
      name: "period.created",
      version: 1,
      title: "Período creado",
      description: "Se creó un período.",
      scope: "kernel.service.periods.read",
      schema: {},
      example: {},
    },
    {
      type: "ping.v1",
      name: "ping",
      version: 1,
      title: "Prueba",
      description: "Prueba.",
      scope: null,
      schema: {},
      example: {},
    },
  ],
};

function endpoint(overrides: Record<string, unknown> = {}) {
  return {
    id: "wh_1",
    appId: APP.id,
    url: "https://padron.example.org/api/webhooks",
    description: "Servidor de producción",
    eventTypes: ["membership.activated.v1"],
    status: "ENABLED",
    disabledReason: null,
    disabledAt: null,
    secretHint: "a1B2",
    previousSecretExpiresAt: null,
    secretRotatedAt: null,
    failingSince: null,
    consecutiveFailures: 0,
    lastSuccessAt: "2026-10-02T21:00:00.000Z",
    lastFailureAt: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

const DELIVERIES = {
  items: [
    {
      id: "del_1",
      endpointId: "wh_1",
      eventId: "evt_ok",
      eventType: "membership.activated.v1",
      organizationId: "org_club",
      status: "SUCCEEDED",
      attempts: 1,
      nextAttemptAt: null,
      retryUntil: "2026-10-05T21:00:00.000Z",
      firstAttemptAt: "2026-10-02T21:00:00.000Z",
      lastAttemptAt: "2026-10-02T21:00:00.000Z",
      lastResponseStatus: 200,
      lastResponseBody: "ok",
      lastLatencyMs: 87,
      lastError: null,
      deliveredAt: "2026-10-02T21:00:00.000Z",
      createdAt: "2026-10-02T21:00:00.000Z",
    },
    {
      id: "del_2",
      endpointId: "wh_1",
      eventId: "evt_failed",
      eventType: "membership.activated.v1",
      organizationId: "org_club",
      status: "FAILED",
      attempts: 12,
      nextAttemptAt: null,
      retryUntil: "2026-10-01T21:00:00.000Z",
      firstAttemptAt: "2026-09-28T21:00:00.000Z",
      lastAttemptAt: "2026-10-01T21:00:00.000Z",
      lastResponseStatus: 503,
      lastResponseBody: "down",
      lastLatencyMs: 40,
      lastError: "Respuesta 503",
      deliveredAt: null,
      createdAt: "2026-09-28T21:00:00.000Z",
    },
  ],
  pageInfo: { hasMore: false, nextCursor: null },
};

const SECRET = "whsec_shown-once-0123456789abcdefghijklmnopqrstuv";

function backendWith(
  endpoints: unknown[],
  extra: (
    request: Request,
    url: URL,
  ) => Promise<Response | undefined> | Response | undefined = () => undefined,
) {
  const backend = new MockBackend();
  backend.kernelHandler = async (request) => {
    const url = new URL(request.url);
    const handled = await extra(request, url);
    if (handled) return handled;
    if (url.pathname.endsWith("/events/catalog")) return jsonResponse(CATALOG);
    if (url.pathname.endsWith("/developer/apps/app_1/webhooks"))
      return jsonResponse(endpoints);
    if (url.pathname.endsWith("/webhooks/wh_1/deliveries"))
      return jsonResponse(DELIVERIES);
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);
  return backend;
}

function renderPanel() {
  return renderWithClient(
    React.createElement(WebhooksPanel, {
      app: APP as never,
      canManage: true,
    }),
  );
}

test("Webhooks tab — lists an endpoint with its deliveries in plain words, and redelivers", async () => {
  let redelivered = "";
  const backend = backendWith([endpoint()], (request, url) => {
    if (request.method === "POST" && url.pathname.endsWith("/redeliver")) {
      redelivered = url.pathname;
      return jsonResponse({ ...DELIVERIES.items[1], status: "PENDING" }, 202);
    }
    return undefined;
  });

  const { getByText, getAllByText, getByRole } = renderPanel();
  await waitFor(() =>
    assert.ok(getByText("https://padron.example.org/api/webhooks")),
  );
  assert.ok(getByText("Servidor de producción"));
  assert.ok(getAllByText("Socio activado").length >= 1);
  assert.ok(getByText("••••a1B2"));
  await waitFor(() => assert.ok(getByText("Respondió 200 en 87 ms")));
  assert.ok(getByText("Entregado"));
  assert.ok(getByText("No se pudo entregar"));

  fireEvent.click(
    getByRole("button", { name: "Reenviar el aviso evt_failed" }),
  );
  await waitFor(() =>
    assert.equal(
      redelivered,
      "/api/kernel/v1/developer/apps/app_1/webhooks/wh_1/deliveries/del_2/redeliver",
    ),
  );
  assert.ok(
    backend.kernelCalls.some((call) => call.url.endsWith("/redeliver")),
  );
  tokenManager.clearSession();
});

test("Webhooks tab — explains an endpoint disabled after 3 days of failures", async () => {
  backendWith([
    endpoint({
      status: "DISABLED",
      disabledReason: "AUTO_FAILURES",
      failingSince: "2026-09-28T00:00:00.000Z",
      consecutiveFailures: 12,
    }),
  ]);
  const { getByText } = renderPanel();
  await waitFor(() => assert.ok(getByText("Desactivado por fallas")));
  assert.ok(getByText("Lo desactivamos porque falló durante 3 días seguidos"));
  tokenManager.clearSession();
});

test("Webhooks tab — add an endpoint: only permitted notices, secret shown once", async () => {
  let createBody: Record<string, unknown> | undefined;
  const created: unknown[] = [];
  const backend = backendWith(created, async (request, url) => {
    if (
      request.method === "POST" &&
      url.pathname.endsWith("/developer/apps/app_1/webhooks")
    ) {
      createBody = (await request.json()) as Record<string, unknown>;
      created.push(endpoint({ url: createBody.url }));
      return jsonResponse({ endpoint: endpoint(), secret: SECRET }, 201);
    }
    return undefined;
  });

  const { getByText, getByRole, getByLabelText, queryByText, queryClient } =
    renderPanel();
  await waitFor(() => assert.ok(getByText("Sin endpoints")));
  await waitFor(() =>
    assert.equal(
      (getByRole("button", { name: "Agregar endpoint" }) as HTMLButtonElement)
        .disabled,
      false,
    ),
  );
  fireEvent.click(getByRole("button", { name: "Agregar endpoint" }));

  fireEvent.change(getByLabelText(/^Dirección que recibe los avisos/), {
    target: { value: "https://padron.example.org/api/webhooks" },
  });
  // The app can't read periods: that notice is offered but disabled, with the reason.
  assert.ok(
    getByText("Para recibirlo, la app necesita el permiso «Leer períodos»."),
  );
  const periods = getByRole("checkbox", { name: /Período creado/ });
  assert.equal(periods.hasAttribute("disabled"), true);
  // The test ping is not a subscription.
  assert.equal(queryByText("ping.v1"), null);

  fireEvent.click(getByRole("checkbox", { name: /Socio activado/ }));
  // While the form is open the header button is hidden: this is the submit.
  fireEvent.click(getByRole("button", { name: "Agregar endpoint" }));

  await waitFor(() => assert.ok(createBody));
  assert.deepEqual(createBody, {
    url: "https://padron.example.org/api/webhooks",
    description: null,
    eventTypes: ["membership.activated.v1"],
  });
  const post = backend.kernelCalls.find((call) => call.method === "POST");
  assert.ok(post?.idempotencyKey, "create carries an Idempotency-Key");

  await waitFor(() => assert.ok(getByText(SECRET)));
  assert.ok(getByText("Secreto de firma (whsec_…)"));
  assert.ok(getByText("No lo vas a poder ver de nuevo"));
  assert.ok(
    !JSON.stringify(
      queryClient
        .getQueryCache()
        .getAll()
        .map((q) => q.state.data),
    ).includes(SECRET),
  );
  fireEvent.click(getByText("Listo, ya lo guardé"));
  await waitFor(() => assert.equal(queryByText(SECRET), null));
  tokenManager.clearSession();
});
