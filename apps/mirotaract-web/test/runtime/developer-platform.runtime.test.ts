// bootstrap.ts installs jsdom's globals and must run before
// `@testing-library/react`/react-dom ever get imported.
import "./bootstrap.ts";

import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import { cleanup, fireEvent, within } from "@testing-library/react";
import React from "react";

import { MockBackend } from "./mock-backend.ts";
import {
  jsonResponse,
  problemResponse,
  renderWithClient,
  renderWithRouter,
  waitFor,
} from "./render.ts";

afterEach(cleanup);

const { tokenManager } =
  await import("../../src/lib/api/client/token-manager.ts");
const { ActiveOrganizationProvider } =
  await import("../../src/features/shell/active-organization-context.tsx");
const { DeveloperAppsListContainer } =
  await import("../../src/features/developer-apps/containers/developer-apps-list-container.tsx");
const { AuthorizeContainer } =
  await import("../../src/features/oauth/containers/authorize-container.tsx");
const { ConnectedAppsContainer } =
  await import("../../src/features/oauth/containers/connected-apps-container.tsx");
const { externalNavigation } =
  await import("../../src/features/oauth/utils/external-navigation.ts");
const { resolveSafeNext } =
  await import("../../src/features/auth/utils/safe-redirect.ts");

function meResponse() {
  return jsonResponse({
    accountId: "acc_1",
    personId: "per_1",
    accountStatus: "ACTIVE",
    platformRole: "USER",
    displayName: "Ana Pérez",
    memberships: [],
    contextVersion: 1,
  });
}

const DISTRICT = {
  id: "org_district1",
  parentId: null,
  type: "DISTRICT",
  code: "D4845",
  name: "Distrito 4845",
  slug: "distrito-4845",
  status: "ACTIVE",
  timezone: "America/Argentina/Cordoba",
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
};

function developerApp(overrides: Record<string, unknown> = {}) {
  return {
    id: "app_1",
    clientId: "mra_0123456789abcdef0123",
    name: "Agenda del comité",
    description: null,
    type: "CONFIDENTIAL",
    status: "ACTIVE",
    organizationId: DISTRICT.id,
    ownerPersonId: "per_1",
    grantTypes: ["authorization_code", "refresh_token"],
    scopes: ["openid", "profile"],
    redirectUris: ["https://agenda.example.org/callback"],
    secrets: [],
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

function fakeActiveOrganization(organizationId: string) {
  return {
    organizationId,
    organization: DISTRICT as never,
    isLoading: false,
    availableMemberships: [],
    availableWorkspaces: [],
    setActiveOrganizationId: () => {},
  };
}

function renderAppsList() {
  return renderWithRouter(
    React.createElement(ActiveOrganizationProvider, {
      value: fakeActiveOrganization(DISTRICT.id),
      children: React.createElement(DeveloperAppsListContainer),
    }),
  );
}

// ---------------------------------------------------------------------------
// E2 — Consola de apps
// ---------------------------------------------------------------------------

test("Developer apps list — renders the apps of the active organization in plain language", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return jsonResponse(["kernel.app.read"]);
    if (url.pathname.endsWith("/descendants")) return jsonResponse([]);
    if (url.pathname.endsWith("/developer/apps")) {
      assert.equal(url.searchParams.get("organizationId"), DISTRICT.id);
      return jsonResponse([developerApp()]);
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, queryByText } = renderAppsList();

  await waitFor(() => assert.ok(getByText("Agenda del comité")));
  assert.ok(getByText("Servidor"));
  assert.ok(getByText("Activa"));
  assert.ok(getByText("Distrito 4845"));
  // Without kernel.app.manage there is no "Registrar app".
  assert.equal(queryByText("Registrar app"), null);

  tokenManager.clearSession();
});

test("Developer apps list — empty state, and 'Registrar app' shows with kernel.app.manage", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return jsonResponse(["kernel.app.read", "kernel.app.manage"]);
    if (url.pathname.endsWith("/descendants")) return jsonResponse([]);
    if (url.pathname.endsWith("/developer/apps")) return jsonResponse([]);
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText } = renderAppsList();

  await waitFor(() => assert.ok(getByText("Todavía no hay apps registradas")));
  await waitFor(() => assert.ok(getByText("Registrar app")));

  tokenManager.clearSession();
});

test("Create developer app — maps plain-language choices to grants/scopes and shows the secret exactly once", async () => {
  const SECRET = "mrs_THIS-IS-THE-ONE-TIME-SECRET";
  const backend = new MockBackend();
  let createBody: Record<string, unknown> | undefined;
  backend.kernelHandler = async (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return jsonResponse(["kernel.app.read", "kernel.app.manage"]);
    if (url.pathname.endsWith("/descendants")) return jsonResponse([]);
    if (url.pathname.endsWith("/developer/apps") && request.method === "GET")
      return jsonResponse(createBody ? [developerApp()] : []);
    if (url.pathname.endsWith("/developer/apps") && request.method === "POST") {
      createBody = (await request.json()) as Record<string, unknown>;
      return jsonResponse(
        { app: developerApp({ name: createBody.name }), clientSecret: SECRET },
        201,
      );
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, queryByText, getByRole, router, queryClient } =
    renderAppsList();

  await waitFor(() => assert.ok(getByText("Registrar app")));
  fireEvent.click(getByText("Registrar app"));
  const dialog = await waitFor(() => getByRole("dialog"));

  fireEvent.change(within(dialog).getByLabelText(/^Nombre/), {
    target: { value: "Agenda del comité" },
  });
  fireEvent.change(within(dialog).getByLabelText(/^Direcciones de regreso/), {
    target: { value: "https://agenda.example.org/callback\n" },
  });
  // Codes never reach the screen — only labels.
  assert.equal(within(dialog).queryByText(/openid|kernel\.service/), null);

  fireEvent.click(
    within(dialog).getByRole("button", { name: "Registrar app" }),
  );

  await waitFor(() => assert.ok(createBody));
  assert.deepEqual(createBody, {
    name: "Agenda del comité",
    description: null,
    organizationId: DISTRICT.id,
    type: "CONFIDENTIAL",
    grantTypes: ["authorization_code", "refresh_token"],
    scopes: ["openid", "profile", "email"],
    redirectUris: ["https://agenda.example.org/callback"],
  });
  const post = backend.kernelCalls.find((call) => call.method === "POST");
  assert.ok(post?.idempotencyKey, "create carries an Idempotency-Key");

  await waitFor(() => assert.ok(getByText(SECRET)));
  assert.ok(getByText("No lo vas a poder ver de nuevo"));
  assert.ok(getByText("mra_0123456789abcdef0123"));
  // The secret is never written to the query cache.
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
  assert.deepEqual(router.pushCalls, ["/developer/apps/app_1"]);

  tokenManager.clearSession();
});

test("Create developer app — client-side check blocks a non-https redirect URI without calling the Kernel", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return jsonResponse(["kernel.app.read", "kernel.app.manage"]);
    if (url.pathname.endsWith("/descendants")) return jsonResponse([]);
    if (url.pathname.endsWith("/developer/apps")) return jsonResponse([]);
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getByRole } = renderAppsList();
  await waitFor(() => assert.ok(getByText("Registrar app")));
  fireEvent.click(getByText("Registrar app"));
  const dialog = await waitFor(() => getByRole("dialog"));
  fireEvent.change(within(dialog).getByLabelText(/^Nombre/), {
    target: { value: "Agenda" },
  });
  fireEvent.change(within(dialog).getByLabelText(/^Direcciones de regreso/), {
    target: { value: "http://agenda.example.org/callback" },
  });
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Registrar app" }),
  );

  await waitFor(() =>
    assert.ok(within(dialog).getByText(/tiene que usar https/)),
  );
  assert.equal(
    backend.kernelCalls.filter((call) => call.method === "POST").length,
    0,
  );

  tokenManager.clearSession();
});

// ---------------------------------------------------------------------------
// E3 — Consentimiento
// ---------------------------------------------------------------------------

const AUTHORIZE_QUERY = new URLSearchParams({
  response_type: "code",
  client_id: "mra_0123456789abcdef0123",
  redirect_uri: "https://agenda.example.org/callback",
  scope: "openid profile",
  state: "xyz",
  nonce: "n-1",
  code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  code_challenge_method: "S256",
});

function contextResponse(alreadyGranted = false) {
  return jsonResponse({
    app: {
      clientId: "mra_0123456789abcdef0123",
      name: "Agenda del comité",
      type: "CONFIDENTIAL",
      organizationName: "Distrito 4845",
    },
    scopes: [
      {
        scope: "openid",
        label: "Saber que sos vos (identificador de tu cuenta)",
      },
      { scope: "profile", label: "Tu nombre y foto" },
    ],
    alreadyGranted,
  });
}

function captureNavigation() {
  const original = externalNavigation.assign;
  const calls: string[] = [];
  externalNavigation.assign = (url: string) => {
    calls.push(url);
  };
  return {
    calls,
    restore: () => {
      externalNavigation.assign = original;
    },
  };
}

function renderAuthorize() {
  return renderWithRouter(React.createElement(AuthorizeContainer), {
    pathname: "/oauth/authorize",
    initialSearchParams: new URLSearchParams(AUTHORIZE_QUERY),
  });
}

test("Consent — shows the app, its organization and what it will see; Permitir posts approve and leaves to redirectTo", async () => {
  const navigation = captureNavigation();
  const backend = new MockBackend();
  let authorizeBody: Record<string, unknown> | undefined;
  backend.kernelHandler = async (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.endsWith("/oauth/authorize/context")) {
      assert.equal(
        url.searchParams.get("client_id"),
        AUTHORIZE_QUERY.get("client_id"),
      );
      return contextResponse();
    }
    if (
      url.pathname.endsWith("/oauth/authorize") &&
      request.method === "POST"
    ) {
      authorizeBody = (await request.json()) as Record<string, unknown>;
      return jsonResponse({
        redirectTo:
          "https://agenda.example.org/callback?code=mrc_abc&state=xyz",
      });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getByRole } = renderAuthorize();

  await waitFor(() => assert.ok(getByText("Ingresar a Agenda del comité")));
  assert.ok(getByText("Distrito 4845"));
  assert.ok(getByText("Tu nombre y foto"));
  await waitFor(() => assert.ok(getByText("Ana Pérez")));
  assert.ok(getByText("¿No sos vos? Cambiar de cuenta"));

  fireEvent.click(getByRole("button", { name: "Permitir" }));

  await waitFor(() => assert.equal(navigation.calls.length, 1));
  assert.equal(
    navigation.calls[0],
    "https://agenda.example.org/callback?code=mrc_abc&state=xyz",
  );
  assert.deepEqual(authorizeBody, {
    clientId: "mra_0123456789abcdef0123",
    redirectUri: "https://agenda.example.org/callback",
    scope: "openid profile",
    codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    codeChallengeMethod: "S256",
    state: "xyz",
    nonce: "n-1",
    decision: "approve",
  });

  navigation.restore();
  tokenManager.clearSession();
});

test("Consent — already granted: approves without asking and follows redirectTo", async () => {
  const navigation = captureNavigation();
  const backend = new MockBackend();
  const decisions: unknown[] = [];
  backend.kernelHandler = async (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.endsWith("/oauth/authorize/context"))
      return contextResponse(true);
    if (
      url.pathname.endsWith("/oauth/authorize") &&
      request.method === "POST"
    ) {
      decisions.push(((await request.json()) as { decision: string }).decision);
      return jsonResponse({
        redirectTo: "https://agenda.example.org/callback?code=c",
      });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { queryByRole } = renderAuthorize();

  await waitFor(() => assert.equal(navigation.calls.length, 1));
  assert.deepEqual(decisions, ["approve"]);
  assert.equal(queryByRole("button", { name: "Permitir" }), null);

  navigation.restore();
  tokenManager.clearSession();
});

test("Consent — Cancelar posts deny and follows redirectTo", async () => {
  const navigation = captureNavigation();
  const backend = new MockBackend();
  let decision: unknown;
  backend.kernelHandler = async (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.endsWith("/oauth/authorize/context"))
      return contextResponse();
    if (
      url.pathname.endsWith("/oauth/authorize") &&
      request.method === "POST"
    ) {
      decision = ((await request.json()) as { decision: string }).decision;
      return jsonResponse({
        redirectTo:
          "https://agenda.example.org/callback?error=access_denied&state=xyz",
      });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByRole } = renderAuthorize();
  await waitFor(() => assert.ok(getByRole("button", { name: "Cancelar" })));
  fireEvent.click(getByRole("button", { name: "Cancelar" }));

  await waitFor(() => assert.equal(navigation.calls.length, 1));
  assert.equal(decision, "deny");
  assert.match(navigation.calls[0]!, /error=access_denied/);

  navigation.restore();
  tokenManager.clearSession();
});

test("Consent — an invalid request (400) is shown on the page and never redirects", async () => {
  const navigation = captureNavigation();
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.endsWith("/oauth/authorize/context")) {
      return problemResponse(400, "KERNEL_VALIDATION_FAILED", {
        detail: "La dirección de regreso no está registrada para esta app.",
      });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, queryByRole, router } = renderAuthorize();

  await waitFor(() =>
    assert.ok(
      getByText("La dirección de regreso no está registrada para esta app."),
    ),
  );
  assert.ok(getByText("No pudimos continuar"));
  assert.equal(queryByRole("button", { name: "Permitir" }), null);
  assert.deepEqual(navigation.calls, []);
  assert.deepEqual(router.replaceCalls, []);
  assert.equal(
    backend.kernelCalls.filter((call) => call.method === "POST").length,
    0,
  );

  navigation.restore();
  tokenManager.clearSession();
});

test("Consent — without a session, redirects to /login with a safe next back to the same request", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = () => problemResponse(404, "NOT_FOUND");
  tokenManager.clearSession();

  const { router } = renderAuthorize();

  await waitFor(() => assert.equal(router.replaceCalls.length, 1));
  const target = router.replaceCalls[0]!;
  assert.ok(target.startsWith("/login?next="));
  const next = new URLSearchParams(target.split("?")[1]).get("next")!;
  assert.equal(next, `/oauth/authorize?${AUTHORIZE_QUERY.toString()}`);
  // The login screen will follow it (same-origin path, not an open redirect).
  assert.equal(resolveSafeNext(next), next);
  assert.equal(
    backend.kernelCalls.filter((call) => call.url.includes("/oauth/")).length,
    0,
  );
});

// ---------------------------------------------------------------------------
// E3 — Apps conectadas
// ---------------------------------------------------------------------------

test("Connected apps — lists what each app can see and 'Quitar acceso' revokes after confirming", async () => {
  const backend = new MockBackend();
  let revoked = false;
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.endsWith("/oauth/consents") && request.method === "GET") {
      return jsonResponse(
        revoked
          ? []
          : [
              {
                appId: "app_1",
                clientId: "mra_0123456789abcdef0123",
                appName: "Agenda del comité",
                organizationName: "Distrito 4845",
                scopes: [{ scope: "email", label: "Tu correo electrónico" }],
                grantedAt: "2026-09-10T00:00:00.000Z",
              },
            ],
      );
    }
    if (
      url.pathname.endsWith("/oauth/consents/app_1") &&
      request.method === "DELETE"
    ) {
      revoked = true;
      return new Response(null, { status: 204 });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getByRole } = renderWithClient(
    React.createElement(ConnectedAppsContainer),
  );

  await waitFor(() => assert.ok(getByText("Agenda del comité")));
  assert.ok(getByText("Tu correo electrónico"));

  fireEvent.click(getByRole("button", { name: "Quitar acceso" }));
  const dialog = await waitFor(() => getByRole("dialog"));
  assert.equal(revoked, false, "nothing happens until confirming");
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Quitar acceso" }),
  );

  await waitFor(() => assert.ok(getByText("No tenés apps conectadas")));
  assert.equal(revoked, true);

  tokenManager.clearSession();
});
