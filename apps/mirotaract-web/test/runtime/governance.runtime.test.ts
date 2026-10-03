// bootstrap.ts installs jsdom's globals and must run before
// `@testing-library/react`/react-dom ever get imported.
import "./bootstrap.ts";

import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import { cleanup, fireEvent, screen, within } from "@testing-library/react";
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
const { ActiveOrganizationProvider } =
  await import("../../src/features/shell/active-organization-context.tsx");
const { MyAppsCard } =
  await import("../../src/features/governance/components/my-apps-grid.tsx");
const { AppCatalogContainer } =
  await import("../../src/features/governance/containers/app-catalog-container.tsx");
const { ReviewDetailContainer } =
  await import("../../src/features/governance/containers/review-detail-container.tsx");
const { AppReviewCard } =
  await import("../../src/features/governance/components/app-review-card.tsx");
const { QuotaPanel } =
  await import("../../src/features/governance/components/quota-panel.tsx");
const { ConnectedAppsContainer } =
  await import("../../src/features/oauth/containers/connected-apps-container.tsx");
const { previewApps } =
  await import("../../src/features/governance/utils/audience-preview.ts");

const DISTRICT = {
  id: "org_district",
  parentId: null,
  type: "DISTRICT",
  code: "D4845",
  name: "Distrito 4845",
  slug: "d4845",
  status: "ACTIVE",
  timezone: "America/Asuncion",
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
};

const APP = {
  id: "app_1",
  clientId: "mra_0123456789abcdef0123",
  name: "Reuniones",
  description: "Actas y asistencia",
  type: "CONFIDENTIAL",
  status: "ACTIVE",
  organizationId: DISTRICT.id,
  ownerPersonId: "per_owner",
  grantTypes: ["client_credentials", "authorization_code"],
  scopes: ["openid", "profile", "kernel.service.persons.read"],
  redirectUris: ["https://reuniones.example/callback"],
  secrets: [],
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  reviewStatus: "IN_REVIEW",
  approvedScopes: [],
  approvedAt: null,
  purpose: "Reuniones distritales",
  privacyPolicyUrl: "https://reuniones.example/privacidad",
  contactEmail: "equipo@reuniones.example",
  testAccountEmails: [],
};

function backend(
  permissions: string[],
  handler: (
    request: Request,
    url: URL,
  ) => Promise<Response | undefined> | Response | undefined,
) {
  const mock = new MockBackend();
  mock.kernelHandler = async (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me"))
      return jsonResponse({
        accountId: "acc_1",
        personId: "per_rdr",
        accountStatus: "ACTIVE",
        platformRole: "USER",
        displayName: "RDR",
        memberships: [],
        contextVersion: 1,
      });
    if (url.pathname.includes("/effective-permissions"))
      return jsonResponse(permissions);
    return (await handler(request, url)) ?? problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(mock.issueToken(), 600);
  return mock;
}

const calls = (mock: MockBackend, method: string, fragment: string) =>
  mock.kernelCalls.filter(
    (call) => call.method === method && call.url.includes(fragment),
  );

function withDistrict(child: React.ReactElement) {
  return React.createElement(ActiveOrganizationProvider, {
    value: {
      organizationId: DISTRICT.id,
      organization: DISTRICT as never,
      isLoading: false,
      availableMemberships: [],
      availableWorkspaces: [],
      setActiveOrganizationId: () => {},
    } as never,
    children: child,
  });
}

// --- E11.4: "Aplicaciones" on the dashboard --------------------------------

test("Aplicaciones — shows the person's apps as cards that open in a new tab", async () => {
  backend([], (_request, url) =>
    url.pathname.endsWith("/me/apps")
      ? jsonResponse([
          {
            appId: "app_1",
            name: "Reuniones",
            description: "Actas y asistencia de tu club",
            icon: "calendar-days",
            launchUrl: "https://reuniones.example",
          },
        ])
      : undefined,
  );
  const { getByText, getByRole } = renderWithClient(
    React.createElement(MyAppsCard),
  );
  await waitFor(() => assert.ok(getByText("Aplicaciones")));
  const link = getByRole("link", { name: /Reuniones/ });
  assert.equal(link.getAttribute("href"), "https://reuniones.example");
  assert.equal(link.getAttribute("target"), "_blank");
  assert.match(link.getAttribute("rel") ?? "", /noopener/);
  assert.ok(getByText("Actas y asistencia de tu club"));
  tokenManager.clearSession();
});

test("Aplicaciones — hidden when the district published nothing for the person", async () => {
  const mock = backend([], (_request, url) =>
    url.pathname.endsWith("/me/apps") ? jsonResponse([]) : undefined,
  );
  const { queryByText } = renderWithClient(React.createElement(MyAppsCard));
  await waitFor(() => assert.equal(calls(mock, "GET", "/me/apps").length, 1));
  await waitFor(() => assert.equal(queryByText("Aplicaciones"), null));
  tokenManager.clearSession();
});

// --- E11.4: the RDR's "Apps del distrito" ----------------------------------

const CATALOG_ITEM = {
  appId: "app_1",
  appName: "Reuniones",
  organizationId: DISTRICT.id,
  organizationName: DISTRICT.name,
  reviewStatus: "APPROVED",
  saved: false,
  module: null,
  listing: {
    published: false,
    displayName: "Reuniones",
    shortDescription: "Actas y asistencia",
    icon: null,
    launchUrl: "https://reuniones.example",
    audiences: [],
    positionCodes: [],
    displayOrder: 100,
    publishedAt: null,
    updatedAt: null,
  },
};

test("Apps del distrito — publishing asks for the audience first, then saves it", async () => {
  let saved: Record<string, unknown> | undefined;
  const mock = backend(["kernel.app.review"], async (request, url) => {
    if (url.pathname.endsWith("/developer/app-catalog"))
      return jsonResponse([
        saved
          ? {
              ...CATALOG_ITEM,
              saved: true,
              listing: { ...CATALOG_ITEM.listing, ...saved },
            }
          : CATALOG_ITEM,
      ]);
    if (url.pathname.endsWith("/developer/apps/app_1/listing")) {
      saved = (await request.json()) as Record<string, unknown>;
      return jsonResponse({ ...CATALOG_ITEM.listing, ...saved });
    }
    if (url.pathname.endsWith("/position-definitions")) return jsonResponse([]);
    return undefined;
  });
  const {
    getByText,
    getByLabelText,
    getByRole,
    getByLabelText: label,
  } = renderWithClient(withDistrict(React.createElement(AppCatalogContainer)));
  await waitFor(() => assert.ok(getByText(/todavía no se guardó/)));
  // Nobody sees it yet in the preview.
  assert.equal(
    getByRole("region", {
      name: "Vista de Una presidencia de club",
    }).textContent?.includes("No ve ninguna app"),
    true,
  );

  fireEvent.click(getByLabelText("Mostrar a los socios"));
  await waitFor(() => assert.ok(getByText("Elegí a quién mostrarle la app")));
  assert.equal(calls(mock, "PUT", "/listing").length, 0);
  fireEvent.click(label("Presidencias de club"));
  fireEvent.click(getByRole("button", { name: "Guardar y mostrar" }));
  await waitFor(() => assert.equal(calls(mock, "PUT", "/listing").length, 1));
  assert.deepEqual(
    { published: saved?.published, audiences: saved?.audiences },
    { published: true, audiences: ["CLUB_PRESIDENTS"] },
  );

  // The preview: a president sees it, a member doesn't.
  await waitFor(() =>
    assert.ok(
      getByRole("region", {
        name: "Vista de Una presidencia de club",
      }).querySelector('a[href="https://reuniones.example"]'),
    ),
  );
  assert.ok(
    getByRole("region", {
      name: "Vista de Un socio sin cargo",
    }).textContent?.includes("No ve ninguna app"),
  );
  tokenManager.clearSession();
});

test("audience preview follows the Kernel's union rule", () => {
  const item = (audiences: string[], positionCodes: string[] = []) => ({
    ...CATALOG_ITEM,
    listing: {
      ...CATALOG_ITEM.listing,
      published: true,
      audiences,
      positionCodes,
    },
  });
  const ids = (items: unknown[], person: "president" | "member") =>
    previewApps(items as never, person).map((app) => app.appId);
  assert.deepEqual(ids([item(["DISTRICT_MEMBERS"])], "member"), ["app_1"]);
  assert.deepEqual(ids([item(["CLUB_AUTHORITIES"])], "president"), ["app_1"]);
  assert.deepEqual(ids([item(["DISTRICT_AUTHORITIES"])], "president"), []);
  assert.deepEqual(
    ids([item(["POSITIONS"], ["CLUB_PRESIDENT"])], "president"),
    ["app_1"],
  );
  assert.deepEqual(
    ids([item(["POSITIONS"], ["CLUB_SECRETARY"])], "president"),
    [],
  );
});

// --- E11.1: review --------------------------------------------------------

test("Revisión — approving needs every checklist item; the decision is sent with it", async () => {
  let decision: Record<string, unknown> | undefined;
  const mock = backend(
    ["kernel.app.review", "kernel.person.read"],
    async (request, url) => {
      if (
        url.pathname.endsWith("/developer/apps/app_1") &&
        request.method === "GET"
      )
        return jsonResponse(APP);
      if (url.pathname.endsWith("/developer/apps/app_1/reviews"))
        return jsonResponse([
          {
            id: "r1",
            kind: "SUBMITTED",
            scopes: APP.scopes,
            createdAt: APP.createdAt,
          },
        ]);
      if (url.pathname.endsWith("/developer/apps/app_1/review")) {
        decision = (await request.json()) as Record<string, unknown>;
        return jsonResponse({
          id: "r2",
          kind: "APPROVED",
          scopes: APP.scopes,
          createdAt: APP.createdAt,
        });
      }
      if (url.pathname.endsWith(`/organizations/${DISTRICT.id}`))
        return jsonResponse(DISTRICT);
      if (url.pathname.endsWith("/persons/per_owner"))
        return jsonResponse({
          id: "per_owner",
          firstName: "Ana",
          lastName: "Gómez",
          displayName: null,
          createdAt: APP.createdAt,
          updatedAt: APP.createdAt,
        });
      return undefined;
    },
  );
  const { getByText, getByRole, getByLabelText } = renderWithClient(
    React.createElement(ReviewDetailContainer, { appId: "app_1" }),
  );
  await waitFor(() => assert.ok(getByText("Lista de control")));
  assert.ok(getByText("Reuniones distritales"));
  const approve = getByRole("button", { name: "Aprobar" }) as HTMLButtonElement;
  assert.equal(approve.disabled, true);
  for (const name of [
    /Propósito/,
    /Datos que pide/,
    /Responsable/,
    /Política de privacidad/,
  ])
    fireEvent.click(getByRole("checkbox", { name }));
  assert.equal(approve.disabled, true);
  fireEvent.click(getByRole("checkbox", { name: /Contacto/ }));
  await waitFor(() => assert.equal(approve.disabled, false));
  // Rejecting needs a reason of 10+ characters.
  const reject = getByRole("button", {
    name: "Pedir cambios",
  }) as HTMLButtonElement;
  assert.equal(reject.disabled, true);
  fireEvent.change(getByLabelText(/Motivo/), { target: { value: "corto" } });
  assert.equal(reject.disabled, true);

  fireEvent.click(approve);
  await waitFor(() => assert.ok(getByText("App aprobada")));
  assert.equal(calls(mock, "POST", "/review").length, 1);
  assert.equal(decision?.decision, "approve");
  assert.deepEqual(decision?.checklist, {
    purpose: true,
    data: true,
    owner: true,
    privacyPolicy: true,
    contact: true,
  });
  tokenManager.clearSession();
});

test("Consola — a rejected app shows the reason, what is limited, and asks for review again", async () => {
  const mock = backend([], (request, url) => {
    if (url.pathname.endsWith("/developer/apps/app_1/reviews"))
      return jsonResponse([
        {
          id: "r2",
          kind: "REJECTED",
          reason: "Falta explicar para qué usa el correo",
          scopes: APP.scopes,
          createdAt: APP.createdAt,
        },
      ]);
    if (url.pathname.endsWith("/review-request") && request.method === "POST")
      return jsonResponse({ appId: "app_1", reviewStatus: "IN_REVIEW" });
    return undefined;
  });
  const { getByText, getAllByText, getByRole } = renderWithClient(
    React.createElement(AppReviewCard, {
      app: { ...APP, reviewStatus: "REJECTED" } as never,
      canManage: true,
      canReview: false,
    }),
  );
  await waitFor(() =>
    assert.ok(
      getAllByText(/Falta explicar para qué usa el correo/).length >= 1,
    ),
  );
  assert.ok(getByText("Con cambios pedidos"));
  assert.ok(
    getByText(/Solo pueden ingresar con Mi Rotaract la persona responsable/),
  );
  assert.ok(
    getByText(/solo puede leer por su cuenta datos que no son personales/),
  );
  fireEvent.click(getByRole("button", { name: "Pedir revisión de nuevo" }));
  await waitFor(() =>
    assert.equal(calls(mock, "POST", "/review-request").length, 1),
  );
  tokenManager.clearSession();
});

test("Límites — shows the minute and day usage; the RDR can set limits", async () => {
  let body: Record<string, unknown> | undefined;
  const quota = {
    enabled: true,
    source: "default",
    perMinute: { limit: 100, used: 37, remaining: 63, resetsInSeconds: 21 },
    perDay: {
      limit: 20000,
      used: 500,
      remaining: 19500,
      resetsInSeconds: 40210,
    },
    defaults: { perMinute: 100, perDay: 20000 },
  };
  const mock = backend([], async (request, url) => {
    if (!url.pathname.endsWith("/developer/apps/app_1/quota")) return undefined;
    if (request.method === "PUT") {
      body = (await request.json()) as Record<string, unknown>;
      return jsonResponse({ ...quota, source: "custom" });
    }
    return jsonResponse(quota);
  });
  const { getByText, getByLabelText, getByRole } = renderWithClient(
    React.createElement(QuotaPanel, {
      app: {
        ...APP,
        reviewStatus: "APPROVED",
        approvedAt: APP.createdAt,
      } as never,
      canReview: true,
    }),
  );
  await waitFor(() => assert.ok(getByText(/37 de 100/)));
  assert.ok(getByText(/500 de 20\.000/));
  fireEvent.change(getByLabelText("Pedidos por minuto"), {
    target: { value: "10" },
  });
  fireEvent.click(getByRole("button", { name: "Guardar límites" }));
  await waitFor(() => assert.equal(calls(mock, "PUT", "/quota").length, 1));
  assert.deepEqual(body, { perMinute: 10, perDay: null });
  tokenManager.clearSession();
});

// --- E11.2: "Apps conectadas" ----------------------------------------------

test("Apps conectadas — history per app, and only connected apps can be removed", async () => {
  let revoked = false;
  const mock = backend([], (request, url) => {
    if (url.pathname.endsWith("/me/app-access"))
      return jsonResponse([
        {
          appId: "app_1",
          appName: "Reuniones",
          organizationName: "Distrito 4845",
          appStatus: "ACTIVE",
          connected: !revoked,
          grantedAt: "2026-10-01T00:00:00.000Z",
          scopes: revoked
            ? []
            : [{ scope: "profile", label: "Tu nombre y foto" }],
          lastAccessAt: "2026-10-04T00:00:00.000Z",
          accessCount: 3,
        },
        {
          appId: "app_2",
          appName: "Padrón del club",
          organizationName: "Rotaract Club San Lorenzo",
          appStatus: "ACTIVE",
          connected: false,
          grantedAt: null,
          scopes: [],
          lastAccessAt: "2026-10-03T00:00:00.000Z",
          accessCount: 1,
        },
      ]);
    if (url.pathname.endsWith("/me/app-access/app_1"))
      return jsonResponse({
        items: [
          {
            id: "a1",
            kind: "SIGN_IN",
            details: ["openid", "profile"],
            description:
              "Ingresaste con tu cuenta: tu identificador y tu nombre y foto",
            occurredAt: "2026-10-04T12:00:00.000Z",
          },
        ],
        pageInfo: { hasMore: false, nextCursor: null },
      });
    if (
      url.pathname.endsWith("/oauth/consents/app_1") &&
      request.method === "DELETE"
    ) {
      revoked = true;
      return new Response(null, { status: 204 });
    }
    return undefined;
  });
  const { getByText, getAllByRole, getByRole, queryAllByRole } =
    renderWithClient(React.createElement(ConnectedAppsContainer));
  await waitFor(() => assert.ok(getByText("Padrón del club")));
  // Only the app the person connected has "Quitar acceso".
  assert.equal(getAllByRole("button", { name: "Quitar acceso" }).length, 1);
  assert.ok(getByText(/la usa tu club o el distrito/));

  fireEvent.click(
    getByRole("button", { name: "Ver historial de accesos (3)" }),
  );
  await waitFor(() => assert.ok(getByText(/Ingresaste con tu cuenta/)));
  // The history request is the person's own, by app.
  assert.ok(calls(mock, "GET", "/me/app-access/app_1").length >= 1);

  fireEvent.click(getAllByRole("button", { name: "Quitar acceso" })[0]);
  // The confirmation is a dialog (rendered in a portal).
  const dialog = await waitFor(() => screen.getByRole("dialog"));
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Quitar acceso" }),
  );
  await waitFor(() =>
    assert.equal(calls(mock, "DELETE", "/oauth/consents/app_1").length, 1),
  );
  await waitFor(() =>
    assert.equal(queryAllByRole("button", { name: "Quitar acceso" }).length, 0),
  );
  tokenManager.clearSession();
});
