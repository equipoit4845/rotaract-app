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
const { RequestLogsPanel } =
  await import("../../src/features/developer-apps/components/request-logs-panel.tsx");
const { WebhooksPanel } =
  await import("../../src/features/developer-apps/components/webhooks-panel.tsx");
const { AppNavigationContext } =
  await import("../../src/features/developer-apps/utils/app-navigation.tsx");

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

function log(overrides: Record<string, unknown> = {}) {
  return {
    id: "log_1",
    appId: "app_1",
    method: "GET",
    route: "/service/organizations/{organizationId}/members",
    status: 403,
    code: "KERNEL_HTTP_403",
    type: "https://api.rotaract4845.com/errors/kernel_http_403",
    latencyMs: 12,
    traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
    clientIp: "181.120.34.0",
    createdAt: "2026-10-04T12:00:00.000Z",
    ...overrides,
  };
}

function backendWithLogs(pages: (url: URL) => unknown) {
  const backend = new MockBackend();
  backend.kernelHandler = async (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/developer/apps/app_1/request-logs"))
      return jsonResponse(pages(url));
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);
  return backend;
}

const logCalls = (backend: MockBackend) =>
  backend.kernelCalls
    .filter((call) => call.url.includes("/request-logs"))
    .map((call) => new URL(call.url).searchParams);

test("Registros — lists requests with route template, code and hint, without personal data", async () => {
  backendWithLogs(() => ({
    items: [log(), log({ id: "log_2", status: 200, code: null, type: null })],
    pageInfo: { hasMore: false, nextCursor: null },
  }));
  const { getByText, getAllByText } = renderWithClient(
    React.createElement(RequestLogsPanel, { app: APP as never }),
  );
  await waitFor(() => assert.ok(getByText("KERNEL_HTTP_403")));
  assert.ok(getByText("Sin permiso o fuera del alcance"));
  assert.equal(
    getAllByText("/service/organizations/{organizationId}/members").length,
    2,
  );
  assert.ok(getAllByText("12 ms").length >= 1);
  tokenManager.clearSession();
});

test("Registros — filters by status class, error code and traceId", async () => {
  const backend = backendWithLogs(() => ({
    items: [log()],
    pageInfo: { hasMore: false, nextCursor: null },
  }));
  const { getByText, getByLabelText, getByRole } = renderWithClient(
    React.createElement(RequestLogsPanel, { app: APP as never }),
  );
  await waitFor(() => assert.ok(getByText("KERNEL_HTTP_403")));

  fireEvent.change(getByLabelText("Resultado"), { target: { value: "4xx" } });
  await waitFor(() =>
    assert.ok(logCalls(backend).some((query) => query.get("status") === "4xx")),
  );

  fireEvent.change(getByLabelText("Código de error"), {
    target: { value: "KERNEL_HTTP_403" },
  });
  fireEvent.change(getByLabelText("traceId"), {
    target: { value: "abc123" },
  });
  fireEvent.click(getByRole("button", { name: "Filtrar" }));
  await waitFor(() =>
    assert.ok(
      logCalls(backend).some(
        (query) =>
          query.get("status") === "4xx" &&
          query.get("code") === "KERNEL_HTTP_403" &&
          query.get("traceId") === "abc123",
      ),
    ),
  );

  // Clicking a traceId filters by it.
  fireEvent.click(getByText("4bf92f3577b34da6a3ce929d0e0e4736"));
  await waitFor(() =>
    assert.ok(
      logCalls(backend).some(
        (query) => query.get("traceId") === "4bf92f3577b34da6a3ce929d0e0e4736",
      ),
    ),
  );
  tokenManager.clearSession();
});

test("Registros — 'Ver más' follows the cursor", async () => {
  const backend = backendWithLogs((url) =>
    url.searchParams.get("cursor") === "log_1"
      ? {
          items: [
            log({ id: "log_9", route: "/oauth/token", code: "invalid_client" }),
          ],
          pageInfo: { hasMore: false, nextCursor: null },
        }
      : { items: [log()], pageInfo: { hasMore: true, nextCursor: "log_1" } },
  );
  const { getByText, getByRole } = renderWithClient(
    React.createElement(RequestLogsPanel, { app: APP as never }),
  );
  await waitFor(() => assert.ok(getByText("KERNEL_HTTP_403")));
  fireEvent.click(getByRole("button", { name: "Ver más" }));
  await waitFor(() => assert.ok(getByText("invalid_client")));
  assert.ok(logCalls(backend).some((query) => query.get("cursor") === "log_1"));
  tokenManager.clearSession();
});

test("Registros — a time window from another tab is applied and can be removed", async () => {
  const backend = backendWithLogs(() => ({
    items: [],
    pageInfo: { hasMore: false, nextCursor: null },
  }));
  const { getByText, getByRole } = renderWithClient(
    React.createElement(RequestLogsPanel, {
      app: APP as never,
      initialFilters: {
        from: "2026-10-01T20:50:00.000Z",
        to: "2026-10-01T21:10:00.000Z",
      },
    }),
  );
  await waitFor(() =>
    assert.ok(getByText("No hay registros con estos filtros")),
  );
  assert.ok(
    logCalls(backend).some(
      (query) =>
        query.get("from") === "2026-10-01T20:50:00.000Z" &&
        query.get("to") === "2026-10-01T21:10:00.000Z",
    ),
  );
  fireEvent.click(getByRole("button", { name: "Quitar período" }));
  await waitFor(() =>
    assert.ok(logCalls(backend).some((query) => !query.has("from"))),
  );
  tokenManager.clearSession();
});

test("Webhooks → Registros — a failed delivery links to the app's logs around its last attempt", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = async (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/events/catalog"))
      return jsonResponse({
        version: 1,
        signature: {},
        envelope: {},
        events: [],
      });
    if (url.pathname.endsWith("/developer/apps/app_1/webhooks"))
      return jsonResponse([
        {
          id: "wh_1",
          appId: "app_1",
          url: "https://padron.example.org/api/webhooks",
          description: null,
          eventTypes: ["membership.activated.v1"],
          status: "ENABLED",
          disabledReason: null,
          disabledAt: null,
          secretHint: "a1B2",
          previousSecretExpiresAt: null,
          secretRotatedAt: null,
          failingSince: null,
          consecutiveFailures: 0,
          lastSuccessAt: null,
          lastFailureAt: null,
          createdAt: "2026-10-01T00:00:00.000Z",
          updatedAt: "2026-10-01T00:00:00.000Z",
        },
      ]);
    if (url.pathname.endsWith("/webhooks/wh_1/deliveries"))
      return jsonResponse({
        items: [
          {
            id: "del_ok",
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
            id: "del_failed",
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
      });
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const jumps: unknown[] = [];
  const { getAllByText, getByText } = renderWithClient(
    React.createElement(
      AppNavigationContext.Provider,
      { value: { showRequestLogs: (filters: unknown) => jumps.push(filters) } },
      React.createElement(WebhooksPanel, {
        app: APP as never,
        canManage: true,
      }),
    ),
  );
  await waitFor(() => assert.ok(getByText("No se pudo entregar")));
  // Only the failed delivery gets the link.
  const links = getAllByText("Ver registros de ese momento");
  assert.equal(links.length, 1);
  fireEvent.click(links[0]);
  assert.deepEqual(jumps, [
    { from: "2026-10-01T20:50:00.000Z", to: "2026-10-01T21:10:00.000Z" },
  ]);
  tokenManager.clearSession();
});
