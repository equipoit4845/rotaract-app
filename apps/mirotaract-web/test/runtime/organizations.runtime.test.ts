// bootstrap.ts installs jsdom's globals and must run before
// `@testing-library/react`/react-dom ever get imported — react-dom reads
// `document`/`window` at module-load time to wire up its synthetic event
// system, and silently no-ops `onChange` handlers for the rest of the
// process if it loaded before those globals existed. `./render.ts` gets
// this right internally, but this file also imports
// `@testing-library/react` directly (for `fireEvent`/`within`/`cleanup`),
// so it needs the same guarantee explicitly, first, itself.
import "./bootstrap.ts";

import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import { cleanup, fireEvent, within } from "@testing-library/react";
import React from "react";

import { MockBackend } from "./mock-backend.ts";
import { renderWithClient, renderWithRouter, waitFor } from "./render.ts";

// `@testing-library/react`'s auto-cleanup only registers itself under
// Jest/Vitest-style globals, which `node:test` doesn't provide — without
// this, each test's DOM output accumulates in the shared jsdom `document`
// across the whole file, and later tests querying by a label that repeats
// across components (e.g. "Filtrar por tipo") get ambiguous matches.
afterEach(cleanup);

const { tokenManager } =
  await import("../../src/lib/api/client/token-manager.ts");
const { OrganizationsListContainer } =
  await import("../../src/features/organizations/containers/organizations-list-container.tsx");
const { OrganizationDetailContainer } =
  await import("../../src/features/organizations/containers/organization-detail-container.tsx");
const { CreateOrganizationDialog } =
  await import("../../src/features/organizations/forms/create-organization-dialog.tsx");
const { EditOrganizationForm } =
  await import("../../src/features/organizations/forms/edit-organization-form.tsx");
const { ActivateOrganizationDialog } =
  await import("../../src/features/organizations/forms/activate-organization-dialog.tsx");
const { ArchiveOrganizationDialog } =
  await import("../../src/features/organizations/forms/archive-organization-dialog.tsx");
const { MoveOrganizationDialog } =
  await import("../../src/features/organizations/forms/move-organization-dialog.tsx");

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function problemResponse(
  status: number,
  code: string,
  extra: Record<string, unknown> = {},
) {
  return jsonResponse(
    {
      type: "about:blank",
      title: code,
      status,
      code,
      instance: "/test",
      ...extra,
    },
    status,
  );
}

function meResponse() {
  return jsonResponse({
    accountId: "acc_1",
    personId: "per_1",
    accountStatus: "ACTIVE",
    platformRole: "USER",
    displayName: "Ana",
    memberships: [],
    contextVersion: 1,
  });
}

function permissionsResponse(perms: string[]) {
  return jsonResponse(perms);
}

function org(overrides: Record<string, unknown>) {
  return {
    id: "org_x",
    parentId: null,
    type: "CLUB",
    code: "RTC-1",
    name: "Club Uno",
    slug: "club-uno",
    status: "ACTIVE",
    timezone: "America/Argentina/Cordoba",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const DISTRICT = org({
  id: "org_district1",
  type: "DISTRICT",
  code: "D4845",
  name: "Distrito 4845",
  slug: "distrito-4845",
});

// ---------------------------------------------------------------------------
// US-ORG-01 — Listing
// ---------------------------------------------------------------------------

test("Organizations list — loading then success: renders a row and resolves its parent's name", async () => {
  const club = org({
    id: "org_club1",
    name: "Rotaract Test",
    code: "RTC-TEST",
    parentId: DISTRICT.id,
  });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname === "/api/kernel/v1/organizations/org_district1")
      return jsonResponse(DISTRICT);
    if (url.pathname.endsWith("/organizations")) {
      return jsonResponse({ items: [club], pageInfo: { hasMore: false } });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText } = renderWithRouter(
    React.createElement(OrganizationsListContainer),
  );

  await waitFor(() => assert.ok(getByText("Rotaract Test")));
  assert.ok(getByText("RTC-TEST"));
  await waitFor(() => assert.ok(getByText("Distrito 4845")), { timeout: 3000 });

  tokenManager.clearSession();
});

test("Organizations list — empty: renders a DataState, not a blank table", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname.endsWith("/organizations")) {
      return jsonResponse({ items: [], pageInfo: { hasMore: false } });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText } = renderWithRouter(
    React.createElement(OrganizationsListContainer),
  );

  await waitFor(() => assert.ok(getByText("Sin organizaciones")));

  tokenManager.clearSession();
});

test('Organizations list — forbidden: a 403 shows the institutional message, never "Error 403"', async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname.endsWith("/organizations"))
      return problemResponse(403, "KERNEL_FORBIDDEN");
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, queryByText } = renderWithRouter(
    React.createElement(OrganizationsListContainer),
  );

  await waitFor(() =>
    assert.ok(
      getByText(
        "No tenés permisos para ver esta información en esta organización.",
      ),
    ),
  );
  assert.equal(queryByText(/error 403/i), null);

  tokenManager.clearSession();
});

test("Organizations list — changing the type filter re-requests with that filter in the URL/query, cursor reset", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname.endsWith("/organizations")) {
      return jsonResponse({ items: [DISTRICT], pageInfo: { hasMore: false } });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByLabelText } = renderWithRouter(
    React.createElement(OrganizationsListContainer),
    { pathname: "/organizations" },
  );

  await waitFor(() => assert.ok(getByLabelText("Filtrar por tipo")));
  const before = backend.kernelCalls.filter((c) =>
    c.url.includes("/organizations"),
  ).length;

  fireEvent.change(getByLabelText("Filtrar por tipo"), {
    target: { value: "DISTRICT" },
  });

  await waitFor(() => {
    const filtered = backend.kernelCalls.filter(
      (c) =>
        c.url.includes("/organizations?") && c.url.includes("type=DISTRICT"),
    );
    assert.ok(
      filtered.length > 0,
      "expected a request with type=DISTRICT after the filter changed",
    );
  });
  assert.ok(
    backend.kernelCalls.filter((c) => c.url.includes("/organizations")).length >
      before,
    "the filter change must trigger a new request, not reuse the old one",
  );

  tokenManager.clearSession();
});

test("Organizations list — cursor pagination: Siguiente fetches the next cursor, Anterior goes back without a new request", async () => {
  const pageOne = org({ id: "org_p1", name: "Página Uno", code: "P1" });
  const pageTwo = org({ id: "org_p2", name: "Página Dos", code: "P2" });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname.endsWith("/organizations")) {
      const cursor = url.searchParams.get("cursor");
      if (cursor === "cursor_2") {
        return jsonResponse({ items: [pageTwo], pageInfo: { hasMore: false } });
      }
      return jsonResponse({
        items: [pageOne],
        pageInfo: { hasMore: true, nextCursor: "cursor_2" },
      });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, queryByText } = renderWithRouter(
    React.createElement(OrganizationsListContainer),
  );

  await waitFor(() => assert.ok(getByText("Página Uno")));
  fireEvent.click(getByText("Siguiente"));

  await waitFor(() => assert.ok(getByText("Página Dos")));
  assert.equal(
    queryByText("Página Uno"),
    null,
    "page 2 replaces page 1 in the table",
  );

  const callsAfterNext = backend.kernelCalls.filter((c) =>
    c.url.includes("/organizations"),
  ).length;
  fireEvent.click(getByText("Anterior"));

  await waitFor(() => assert.ok(getByText("Página Uno")));
  const callsAfterPrevious = backend.kernelCalls.filter((c) =>
    c.url.includes("/organizations"),
  ).length;
  assert.equal(
    callsAfterPrevious,
    callsAfterNext,
    "going back to a page already in memory must not issue a new request",
  );

  tokenManager.clearSession();
});

test("Organizations list — anti-N+1: rows sharing one parent resolve it with a single request, not one per row", async () => {
  const clubA = org({
    id: "org_a",
    name: "Club A",
    code: "A",
    parentId: DISTRICT.id,
  });
  const clubB = org({
    id: "org_b",
    name: "Club B",
    code: "B",
    parentId: DISTRICT.id,
  });
  const clubC = org({
    id: "org_c",
    name: "Club C",
    code: "C",
    parentId: DISTRICT.id,
  });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname === "/api/kernel/v1/organizations/org_district1")
      return jsonResponse(DISTRICT);
    if (url.pathname.endsWith("/organizations")) {
      return jsonResponse({
        items: [clubA, clubB, clubC],
        pageInfo: { hasMore: false },
      });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getAllByText } = renderWithRouter(
    React.createElement(OrganizationsListContainer),
  );

  await waitFor(() => assert.ok(getByText("Club A")));
  await waitFor(() => assert.equal(getAllByText("Distrito 4845").length, 3));

  const parentCalls = backend.kernelCalls.filter(
    (c) =>
      c.url === "https://kernel.test/api/kernel/v1/organizations/org_district1",
  );
  assert.equal(
    parentCalls.length,
    1,
    "three rows sharing the same parentId must dedupe into a single request via the query cache",
  );

  tokenManager.clearSession();
});

// ---------------------------------------------------------------------------
// US-ORG-02/03 — Detail + hierarchy
// ---------------------------------------------------------------------------

test("Organization detail — success: renders name/code and a breadcrumb from ancestors, without requesting children", async () => {
  const club = org({
    id: "org_club1",
    name: "Rotaract Test",
    code: "RTC-TEST",
    parentId: DISTRICT.id,
  });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname === "/api/kernel/v1/organizations/org_club1")
      return jsonResponse(club);
    if (url.pathname === "/api/kernel/v1/organizations/org_club1/ancestors") {
      return jsonResponse([DISTRICT]);
    }
    if (url.pathname === "/api/kernel/v1/organizations/org_district1")
      return jsonResponse(DISTRICT);
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getAllByText } = renderWithClient(
    React.createElement(OrganizationDetailContainer, {
      organizationId: "org_club1",
    }),
  );

  await waitFor(() => assert.ok(getAllByText("Rotaract Test").length > 0));
  await waitFor(() => assert.ok(getByText("Distrito 4845")), { timeout: 3000 });

  const childrenCalls = backend.kernelCalls.filter((c) =>
    c.url.includes("/children"),
  );
  assert.equal(
    childrenCalls.length,
    0,
    "the Jerarquía tab isn't active by default — its children request must not fire",
  );

  tokenManager.clearSession();
});

test("Organization detail — not found: a 404 renders 'no encontrada', not a generic error", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname === "/api/kernel/v1/organizations/org_missing") {
      return problemResponse(404, "KERNEL_NOT_FOUND");
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText } = renderWithClient(
    React.createElement(OrganizationDetailContainer, {
      organizationId: "org_missing",
    }),
  );

  await waitFor(() => assert.ok(getByText("Organización no encontrada")));

  tokenManager.clearSession();
});

test("Organization detail — forbidden: a 403 shows the institutional message", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname === "/api/kernel/v1/organizations/org_secret") {
      return problemResponse(403, "KERNEL_FORBIDDEN");
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText } = renderWithClient(
    React.createElement(OrganizationDetailContainer, {
      organizationId: "org_secret",
    }),
  );

  await waitFor(() =>
    assert.ok(
      getByText(
        "No tenés permisos para ver esta información en esta organización.",
      ),
    ),
  );

  tokenManager.clearSession();
});

test("Organization detail — Jerarquía tab: children only fire once that tab is actually opened", async () => {
  const club = org({
    id: "org_club1",
    name: "Rotaract Test",
    code: "RTC-TEST",
    parentId: DISTRICT.id,
  });
  const child = org({
    id: "org_child1",
    name: "Sub Club",
    code: "SUB",
    parentId: club.id as string,
  });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname === "/api/kernel/v1/organizations/org_club1")
      return jsonResponse(club);
    if (url.pathname === "/api/kernel/v1/organizations/org_club1/ancestors")
      return jsonResponse([]);
    if (url.pathname === "/api/kernel/v1/organizations/org_club1/children") {
      return jsonResponse([child]);
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getAllByText } = renderWithClient(
    React.createElement(OrganizationDetailContainer, {
      organizationId: "org_club1",
    }),
  );

  await waitFor(() => assert.ok(getAllByText("Rotaract Test").length > 0));
  assert.equal(
    backend.kernelCalls.filter((c) => c.url.includes("/children")).length,
    0,
  );

  // Radix's Tabs.Trigger selects on `mousedown` (and Enter/Space/focus),
  // not `click` — see @radix-ui/react-tabs's TabsTrigger.
  fireEvent.mouseDown(getByText("Jerarquía"));

  await waitFor(() => assert.ok(getByText("Sub Club")));
  assert.equal(
    backend.kernelCalls.filter((c) => c.url.includes("/children")).length,
    1,
  );

  tokenManager.clearSession();
});

test("Organization detail — renders standalone: doesn't depend on ActiveOrganizationContext, so it never touches the Shell's active organization", async () => {
  const club = org({
    id: "org_club1",
    name: "Rotaract Test",
    code: "RTC-TEST",
  });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname === "/api/kernel/v1/organizations/org_club1")
      return jsonResponse(club);
    if (url.pathname === "/api/kernel/v1/organizations/org_club1/ancestors")
      return jsonResponse([]);
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  // No ActiveOrganizationProvider anywhere in this tree — if the container
  // needed it, this would throw ("must be used within <DashboardShell>")
  // instead of rendering, proving §4's isolation holds structurally.
  const { getAllByText } = renderWithClient(
    React.createElement(OrganizationDetailContainer, {
      organizationId: "org_club1",
    }),
  );

  await waitFor(() => assert.ok(getAllByText("RTC-TEST").length > 0));

  tokenManager.clearSession();
});

// ---------------------------------------------------------------------------
// US-ORG-04 — Create
// ---------------------------------------------------------------------------

// `FormField` appends a " *" required-marker span to the label's text
// content for required fields, so an exact-text label match fails —
// `exact: false` matches on a substring instead.
function labelText(
  getByLabelText: (text: string, options?: { exact?: boolean }) => HTMLElement,
  label: string,
): HTMLElement {
  return getByLabelText(label, { exact: false });
}

function fillCreateForm(
  getByLabelText: (text: string, options?: { exact?: boolean }) => HTMLElement,
  values: Record<string, string>,
) {
  for (const [label, value] of Object.entries(values)) {
    fireEvent.change(labelText(getByLabelText, label), { target: { value } });
  }
}

test("Create organization — success: submits CreateOrganizationRequest and navigates to the new detail page", async () => {
  const created = org({
    id: "org_new",
    name: "Club Nuevo",
    code: "NEW",
    slug: "club-nuevo",
    parentId: DISTRICT.id,
  });
  const backend = new MockBackend();
  let createBody: unknown;
  backend.kernelHandler = async (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (request.method === "GET" && url.pathname.endsWith("/organizations")) {
      return jsonResponse({ items: [DISTRICT], pageInfo: { hasMore: false } });
    }
    if (request.method === "POST" && url.pathname.endsWith("/organizations")) {
      createBody = await request.json();
      return jsonResponse(created, 201);
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getByLabelText, router } = renderWithRouter(
    React.createElement(CreateOrganizationDialog),
  );

  fireEvent.click(getByText("Crear organización"));
  await waitFor(() => assert.ok(getByLabelText("Nombre", { exact: false })));

  fillCreateForm(getByLabelText, {
    Nombre: "Club Nuevo",
    Código: "NEW",
    Slug: "club-nuevo",
  });
  await waitFor(() =>
    assert.ok(getByLabelText("Organización padre", { exact: false })),
  );
  fireEvent.change(getByLabelText("Organización padre", { exact: false }), {
    target: { value: DISTRICT.id },
  });

  fireEvent.click(
    getByText("Crear organización", { selector: "button[type=submit]" }),
  );

  await waitFor(() => {
    assert.deepEqual(createBody, {
      type: "CLUB",
      name: "Club Nuevo",
      code: "NEW",
      slug: "club-nuevo",
      parentId: DISTRICT.id,
      countryCode: null,
      region: null,
      city: null,
      contactEmail: null,
      contactPhone: null,
      description: null,
    });
  });

  await waitFor(() =>
    assert.ok(router.pushCalls.includes(`/organizations/${created.id}`)),
  );

  tokenManager.clearSession();
});

test("Create organization — 409 duplicate code/slug: shows the institutional conflict message and keeps the dialog open", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (request.method === "GET" && url.pathname.endsWith("/organizations")) {
      return jsonResponse({ items: [DISTRICT], pageInfo: { hasMore: false } });
    }
    if (request.method === "POST" && url.pathname.endsWith("/organizations")) {
      return problemResponse(409, "KERNEL_CONFLICT", {
        detail: "code already exists",
      });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getByLabelText } = renderWithRouter(
    React.createElement(CreateOrganizationDialog),
  );

  fireEvent.click(getByText("Crear organización"));
  await waitFor(() => assert.ok(getByLabelText("Nombre", { exact: false })));
  fillCreateForm(getByLabelText, {
    Nombre: "Club Dup",
    Código: "DUP",
    Slug: "club-dup",
  });
  await waitFor(() =>
    assert.ok(getByLabelText("Organización padre", { exact: false })),
  );
  fireEvent.change(getByLabelText("Organización padre", { exact: false }), {
    target: { value: DISTRICT.id },
  });

  fireEvent.click(
    getByText("Crear organización", { selector: "button[type=submit]" }),
  );

  await waitFor(() =>
    assert.ok(getByText("Ya existe una organización con ese código o slug.")),
  );
  assert.ok(
    getByLabelText("Nombre", { exact: false }),
    "the dialog stays open on error, the form isn't lost",
  );

  tokenManager.clearSession();
});

test("Create organization — 422 invalid hierarchy: shows the institutional validation message", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (request.method === "GET" && url.pathname.endsWith("/organizations")) {
      return jsonResponse({ items: [DISTRICT], pageInfo: { hasMore: false } });
    }
    if (request.method === "POST" && url.pathname.endsWith("/organizations")) {
      return problemResponse(422, "KERNEL_VALIDATION", {
        detail: "invalid hierarchy",
      });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getByLabelText } = renderWithRouter(
    React.createElement(CreateOrganizationDialog),
  );

  fireEvent.click(getByText("Crear organización"));
  await waitFor(() => assert.ok(getByLabelText("Nombre", { exact: false })));
  fillCreateForm(getByLabelText, {
    Nombre: "Club X",
    Código: "X",
    Slug: "club-x",
  });
  await waitFor(() =>
    assert.ok(getByLabelText("Organización padre", { exact: false })),
  );
  fireEvent.change(getByLabelText("Organización padre", { exact: false }), {
    target: { value: DISTRICT.id },
  });

  fireEvent.click(
    getByText("Crear organización", { selector: "button[type=submit]" }),
  );

  await waitFor(() =>
    assert.ok(
      getByText(
        "Los datos ingresados no son válidos para esta jerarquía institucional.",
      ),
    ),
  );

  tokenManager.clearSession();
});

// ---------------------------------------------------------------------------
// US-ORG-05 — Edit
// ---------------------------------------------------------------------------

test("Edit organization — success: PATCHes only UpdateOrganizationRequest fields and navigates back to detail", async () => {
  const existing = org({
    id: "org_edit1",
    name: "Nombre Viejo",
    code: "OLD",
    slug: "nombre-viejo",
    city: "Córdoba",
  });
  const backend = new MockBackend();
  let patchBody: unknown;
  backend.kernelHandler = async (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (
      request.method === "PATCH" &&
      url.pathname.endsWith("/organizations/org_edit1")
    ) {
      patchBody = await request.json();
      return jsonResponse({ ...existing, name: "Nombre Nuevo" });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByLabelText, getByText, router } = renderWithRouter(
    React.createElement(EditOrganizationForm, {
      organization: existing as never,
    }),
  );

  fireEvent.change(getByLabelText("Nombre", { exact: false }), {
    target: { value: "Nombre Nuevo" },
  });
  fireEvent.click(getByText("Guardar cambios"));

  await waitFor(() => assert.ok(patchBody));
  assert.deepEqual(patchBody, {
    name: "Nombre Nuevo",
    countryCode: null,
    region: null,
    city: "Córdoba",
    contactEmail: null,
    contactPhone: null,
    description: null,
  });
  await waitFor(() =>
    assert.ok(router.pushCalls.includes(`/organizations/${existing.id}`)),
  );

  tokenManager.clearSession();
});

// ---------------------------------------------------------------------------
// US-ORG-06/07/08 — Lifecycle: activate / archive / move
// ---------------------------------------------------------------------------

test("Activate organization — visible only with permission + INACTIVE status, confirms, then calls activate (no optimistic change)", async () => {
  const inactive = org({
    id: "org_inactive1",
    name: "Club Inactivo",
    status: "INACTIVE",
  });
  const backend = new MockBackend();
  let activateCalled = false;
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions")) {
      return permissionsResponse(["kernel.organization.activate"]);
    }
    if (
      request.method === "POST" &&
      url.pathname.endsWith("/organizations/org_inactive1/activate")
    ) {
      activateCalled = true;
      return jsonResponse({ ...inactive, status: "ACTIVE" });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getByRole } = renderWithClient(
    React.createElement(ActivateOrganizationDialog, {
      organization: inactive as never,
    }),
  );

  await waitFor(() => assert.ok(getByText("Activar")));
  fireEvent.click(getByText("Activar"));

  const dialog = await waitFor(() => getByRole("dialog"));
  const confirmButton = within(dialog).getByText("Activar");
  assert.equal(
    activateCalled,
    false,
    "no request until the confirm button is actually clicked",
  );
  fireEvent.click(confirmButton);

  await waitFor(() => assert.equal(activateCalled, true));

  tokenManager.clearSession();
});

test("Archive organization — a 409 invalid transition from the Kernel surfaces in the dialog and never applies locally", async () => {
  const draft = org({
    id: "org_draft1",
    name: "Club Borrador",
    status: "DRAFT",
  });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions")) {
      return permissionsResponse(["kernel.organization.archive"]);
    }
    if (
      request.method === "POST" &&
      url.pathname.endsWith("/organizations/org_draft1/archive")
    ) {
      return problemResponse(409, "KERNEL_INVALID_TRANSITION", {
        detail: "DRAFT organization cannot archive in this state",
      });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getByRole } = renderWithClient(
    React.createElement(ArchiveOrganizationDialog, {
      organization: draft as never,
    }),
  );

  await waitFor(() => assert.ok(getByText("Archivar")));
  fireEvent.click(getByText("Archivar"));

  const dialog = await waitFor(() => getByRole("dialog"));
  fireEvent.click(within(dialog).getByText("Archivar"));

  await waitFor(() =>
    assert.ok(
      within(dialog).getByText(
        "DRAFT organization cannot archive in this state",
      ),
    ),
  );
  // The dialog is still open with the confirm action visible — no silent
  // success, no local status flip despite the failed mutation.
  assert.ok(within(dialog).getByText("Archivar organización"));

  tokenManager.clearSession();
});

test("Move organization — a 409 on this endpoint always means a hierarchy cycle, never guessed client-side", async () => {
  const club = org({
    id: "org_move1",
    name: "Club a Mover",
    parentId: DISTRICT.id,
  });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions")) {
      return permissionsResponse(["kernel.organization.move"]);
    }
    if (request.method === "GET" && url.pathname.endsWith("/organizations")) {
      return jsonResponse({ items: [DISTRICT], pageInfo: { hasMore: false } });
    }
    if (url.pathname === "/api/kernel/v1/organizations/org_district1")
      return jsonResponse(DISTRICT);
    if (
      request.method === "POST" &&
      url.pathname.endsWith("/organizations/org_move1/move")
    ) {
      return problemResponse(409, "KERNEL_CONFLICT");
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getByRole } = renderWithClient(
    React.createElement(MoveOrganizationDialog, {
      organization: club as never,
    }),
  );

  await waitFor(() => assert.ok(getByText("Mover")));
  fireEvent.click(getByText("Mover"));

  const dialog = await waitFor(() => getByRole("dialog"));
  fireEvent.click(within(dialog).getByText("Mover"));

  await waitFor(() =>
    assert.ok(
      within(dialog).getByText(
        "No se puede mover esta organización porque generaría una jerarquía circular.",
      ),
    ),
  );

  tokenManager.clearSession();
});

test("Move organization — success: calls move with the chosen newParentId", async () => {
  const otherDistrict = org({
    id: "org_district2",
    type: "DISTRICT",
    code: "D9999",
    name: "Distrito 9999",
  });
  const club = org({
    id: "org_move2",
    name: "Club a Mover 2",
    parentId: DISTRICT.id,
  });
  const backend = new MockBackend();
  let moveBody: unknown;
  backend.kernelHandler = async (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions")) {
      return permissionsResponse(["kernel.organization.move"]);
    }
    if (request.method === "GET" && url.pathname.endsWith("/organizations")) {
      return jsonResponse({
        items: [otherDistrict],
        pageInfo: { hasMore: false },
      });
    }
    if (url.pathname === "/api/kernel/v1/organizations/org_district1")
      return jsonResponse(DISTRICT);
    if (
      request.method === "POST" &&
      url.pathname.endsWith("/organizations/org_move2/move")
    ) {
      moveBody = await request.json();
      return jsonResponse({ ...club, parentId: otherDistrict.id });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getByRole } = renderWithClient(
    React.createElement(MoveOrganizationDialog, {
      organization: club as never,
    }),
  );

  await waitFor(() => assert.ok(getByText("Mover")));
  fireEvent.click(getByText("Mover"));

  const dialog = await waitFor(() => getByRole("dialog"));
  const select = within(dialog).getByLabelText("Nuevo padre");
  await waitFor(() =>
    assert.ok(within(dialog).getByText(otherDistrict.name as string)),
  );
  fireEvent.change(select, { target: { value: otherDistrict.id } });
  fireEvent.click(within(dialog).getByText("Mover"));

  await waitFor(() =>
    assert.deepEqual(moveBody, { newParentId: otherDistrict.id }),
  );

  tokenManager.clearSession();
});
