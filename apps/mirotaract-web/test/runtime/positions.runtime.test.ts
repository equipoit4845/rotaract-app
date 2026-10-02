// bootstrap.ts installs jsdom's globals and must run before
// `@testing-library/react`/react-dom ever get imported — see the same note
// in organizations.runtime.test.ts.
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
  renderWithRouter,
  waitFor,
} from "./render.ts";

afterEach(cleanup);

const { tokenManager } =
  await import("../../src/lib/api/client/token-manager.ts");
const { ActiveOrganizationProvider } =
  await import("../../src/features/shell/active-organization-context.tsx");
const { PositionsListContainer } =
  await import("../../src/features/positions/containers/positions-list-container.tsx");
const { CreatePositionContainer } =
  await import("../../src/features/positions/containers/create-position-container.tsx");
const { PositionDetailContainer } =
  await import("../../src/features/positions/containers/position-detail-container.tsx");

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

function position(overrides: Record<string, unknown> = {}) {
  return {
    id: "pos_1",
    code: "CLUB_PRESIDENT",
    name: "Presidente de Club",
    description: null,
    organizationType: "DISTRICT",
    ownerOrganizationId: DISTRICT.id,
    editPermissionCode: "kernel.position.manage",
    defaultRoleCode: null,
    isSingletonPerPeriod: true,
    isSystem: false,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Fake `useActiveOrganization()` return shape — real shell context, faked value (product spec §6). */
function fakeActiveOrganization(organizationId: string | undefined) {
  return {
    organizationId,
    organization: organizationId ? (DISTRICT as never) : undefined,
    isLoading: false,
    availableMemberships: [],
    setActiveOrganizationId: () => {},
  };
}

function renderPositionsList(
  activeOrganizationId: string | undefined,
  options: Parameters<typeof renderWithRouter>[1] = {},
) {
  return renderWithRouter(
    React.createElement(ActiveOrganizationProvider, {
      value: fakeActiveOrganization(activeOrganizationId),
      children: React.createElement(PositionsListContainer),
    }),
    options,
  );
}

// ---------------------------------------------------------------------------
// US-POS-01 — Catálogo de cargos
// ---------------------------------------------------------------------------

test("Positions list — loading then success: renders a row for a district position", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname.endsWith("/position-definitions")) {
      return jsonResponse([position()]);
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, queryByText } = renderPositionsList(DISTRICT.id);

  await waitFor(() => assert.ok(getByText("Presidente de Club")));
  // People read names, never the internal code.
  assert.equal(queryByText("CLUB_PRESIDENT"), null);

  tokenManager.clearSession();
});

test("Positions list — empty: renders a DataState, not a blank table", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname.endsWith("/position-definitions")) return jsonResponse([]);
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText } = renderPositionsList(DISTRICT.id);

  await waitFor(() => assert.ok(getByText("Sin cargos")));

  tokenManager.clearSession();
});

test('Positions list — forbidden: a 403 shows the institutional message, never "Error 403"', async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname.endsWith("/position-definitions")) {
      return problemResponse(403, "KERNEL_FORBIDDEN");
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, queryByText } = renderPositionsList(DISTRICT.id);

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

test("Positions list — filter by organizationType re-requests with that filter in the query", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname.endsWith("/position-definitions"))
      return jsonResponse([position()]);
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByLabelText } = renderPositionsList(DISTRICT.id);

  await waitFor(() => assert.ok(getByLabelText("Filtrar por alcance")));
  fireEvent.change(getByLabelText("Filtrar por alcance"), {
    target: { value: "CLUB" },
  });

  await waitFor(() => {
    const filtered = backend.kernelCalls.filter(
      (c) =>
        c.url.includes("/position-definitions?") &&
        c.url.includes("organizationType=CLUB"),
    );
    assert.ok(
      filtered.length > 0,
      "expected a request with organizationType=CLUB",
    );
  });

  tokenManager.clearSession();
});

test("Positions list — 'Crear cargo' link only shows with kernel.position.create", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions")) {
      return permissionsResponse(["kernel.position.create"]);
    }
    if (url.pathname.endsWith("/position-definitions")) return jsonResponse([]);
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText } = renderPositionsList(DISTRICT.id);

  await waitFor(() => assert.ok(getByText("Crear cargo")));

  tokenManager.clearSession();
});

test("Positions list — 'Crear cargo' link is hidden without permission", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname.endsWith("/position-definitions")) return jsonResponse([]);
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { queryByText } = renderPositionsList(DISTRICT.id);

  await waitFor(() => assert.ok(queryByText("Sin cargos")));
  assert.equal(queryByText("Crear cargo"), null);

  tokenManager.clearSession();
});

// ---------------------------------------------------------------------------
// US-POS-02 — Crear cargo distrital
// ---------------------------------------------------------------------------

function labelText(
  getByLabelText: (text: string, options?: { exact?: boolean }) => HTMLElement,
  label: string,
): HTMLElement {
  return getByLabelText(label, { exact: false });
}

test("Create position — success: submits CreatePositionDefinitionRequest and navigates to the new detail page", async () => {
  const created = position({
    id: "pos_new",
    code: "NEW_POS",
    name: "Cargo Nuevo",
  });
  const backend = new MockBackend();
  let createBody: unknown;
  backend.kernelHandler = async (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions")) {
      return permissionsResponse(["kernel.position.create"]);
    }
    if (request.method === "GET" && url.pathname.endsWith("/organizations")) {
      return jsonResponse({ items: [DISTRICT], pageInfo: { hasMore: false } });
    }
    if (
      request.method === "POST" &&
      url.pathname.endsWith("/position-definitions")
    ) {
      createBody = await request.json();
      return jsonResponse(created, 201);
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByLabelText, getByText, router } = renderWithRouter(
    React.createElement(ActiveOrganizationProvider, {
      value: fakeActiveOrganization(DISTRICT.id),
      children: React.createElement(CreatePositionContainer),
    }),
  );

  await waitFor(() => assert.ok(getByLabelText(/^Distrito/)));
  // Wait for the district candidates request to resolve so the <option>
  // actually exists before setting the <select>'s value — otherwise jsdom
  // silently ignores the assignment (no matching option) and the field
  // stays empty, failing required validation without ever submitting.
  await waitFor(() => assert.ok(getByText(DISTRICT.name)));
  fireEvent.change(getByLabelText(/^Distrito/), {
    target: { value: DISTRICT.id },
  });

  fillForm(getByLabelText, { Nombre: "Cargo Nuevo" });

  fireEvent.click(
    getByLabelText(/^Distrito/)
      .closest("form")!
      .querySelector("button[type=submit]") as HTMLElement,
  );

  await waitFor(() => assert.ok(createBody));
  // The code is derived from the name; nobody types it.
  const { code, ...rest } = createBody as { code: string };
  assert.match(code, /^DISTRICT_CARGO_NUEVO_[A-Z0-9]{2,4}$/);
  assert.deepEqual(rest, {
    name: "Cargo Nuevo",
    description: null,
    organizationType: "DISTRICT",
    ownerOrganizationId: DISTRICT.id,
    editPermissionCode: "kernel.position.manage",
    defaultRoleCode: null,
    isSingletonPerPeriod: false,
  });
  await waitFor(() =>
    assert.ok(router.pushCalls.includes(`/positions/${created.id}`)),
  );

  tokenManager.clearSession();
});

function fillForm(
  getByLabelText: (text: string, options?: { exact?: boolean }) => HTMLElement,
  values: Record<string, string>,
) {
  for (const [label, value] of Object.entries(values)) {
    fireEvent.change(labelText(getByLabelText, label), { target: { value } });
  }
}

test("Create position — hidden without kernel.position.create", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText } = renderWithClient(
    React.createElement(ActiveOrganizationProvider, {
      value: fakeActiveOrganization(DISTRICT.id),
      children: React.createElement(CreatePositionContainer),
    }),
  );

  await waitFor(() =>
    assert.ok(
      getByText("No tenés permisos para crear cargos en este distrito."),
    ),
  );

  tokenManager.clearSession();
});

const PERMISSION = {
  id: "perm_1",
  code: "kernel.membership.read",
  namespace: "kernel",
  name: "Ver el padrón de socios",
  isSystem: true,
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
};

// ---------------------------------------------------------------------------
// US-POS-03 — Editar cargo + permisos
// ---------------------------------------------------------------------------

test("Position detail — edit success: PATCHes UpdatePositionDefinitionRequest fields", async () => {
  const existing = position({ id: "pos_edit1", name: "Nombre Viejo" });
  const backend = new MockBackend();
  let patchBody: unknown;
  backend.kernelHandler = async (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions")) {
      return permissionsResponse(["kernel.position.manage"]);
    }
    if (url.pathname.endsWith("/position-definitions"))
      return jsonResponse([existing]);
    if (url.pathname === "/api/kernel/v1/organizations/org_district1") {
      return jsonResponse(DISTRICT);
    }
    if (
      request.method === "PATCH" &&
      url.pathname.endsWith("/position-definitions/pos_edit1")
    ) {
      patchBody = await request.json();
      return jsonResponse({ ...existing, name: "Nombre Nuevo" });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByLabelText, getByText } = renderWithClient(
    React.createElement(PositionDetailContainer, {
      positionDefinitionId: "pos_edit1",
    }),
  );

  await waitFor(() => assert.ok(getByLabelText("Nombre", { exact: false })));
  fireEvent.change(getByLabelText("Nombre", { exact: false }), {
    target: { value: "Nombre Nuevo" },
  });
  fireEvent.click(getByText("Guardar cambios"));

  await waitFor(() => assert.ok(patchBody));
  assert.deepEqual(patchBody, {
    name: "Nombre Nuevo",
    description: null,
    isSingletonPerPeriod: true,
  });

  tokenManager.clearSession();
});

test("Position detail — the district edits its own system positions when it holds the edit permission", async () => {
  const systemPosition = position({
    id: "pos_system1",
    isSystem: true,
  });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions")) {
      return permissionsResponse(["kernel.position.manage"]);
    }
    if (url.pathname.endsWith("/position-definitions"))
      return jsonResponse([systemPosition]);
    if (url.pathname === "/api/kernel/v1/organizations/org_district1") {
      return jsonResponse(DISTRICT);
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByLabelText } = renderWithClient(
    React.createElement(PositionDetailContainer, {
      positionDefinitionId: "pos_system1",
    }),
  );

  await waitFor(() => assert.ok(getByLabelText("Nombre", { exact: false })));

  tokenManager.clearSession();
});

test("Position detail — permissions panel: a position without a derived role explains it is informational only", async () => {
  const noRole = position({ id: "pos_norole1", defaultRoleCode: null });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions")) {
      return permissionsResponse(["kernel.position.manage"]);
    }
    if (url.pathname.endsWith("/position-definitions"))
      return jsonResponse([noRole]);
    if (url.pathname === "/api/kernel/v1/organizations/org_district1") {
      return jsonResponse(DISTRICT);
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText } = renderWithClient(
    React.createElement(PositionDetailContainer, {
      positionDefinitionId: "pos_norole1",
    }),
  );

  await waitFor(() => assert.ok(getByText("Este cargo es solo informativo.")));

  tokenManager.clearSession();
});

test("Position detail — attach permission: success calls attachPermissionToPosition with the chosen permission", async () => {
  const withRole = position({
    id: "pos_role1",
    defaultRoleCode: "CLUB_PRESIDENT",
  });
  const backend = new MockBackend();
  let attachedPermissionId: string | undefined;
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions")) {
      return permissionsResponse(["kernel.position.manage"]);
    }
    if (url.pathname.endsWith("/position-definitions"))
      return jsonResponse([withRole]);
    if (url.pathname === "/api/kernel/v1/organizations/org_district1") {
      return jsonResponse(DISTRICT);
    }
    if (url.pathname.endsWith("/position-definitions/pos_role1/permissions"))
      return jsonResponse(attachedPermissionId ? [PERMISSION] : []);
    if (url.pathname.endsWith("/permissions") && request.method === "GET")
      return jsonResponse([PERMISSION]);
    if (
      request.method === "PUT" &&
      url.pathname ===
        "/api/kernel/v1/position-definitions/pos_role1/permissions/perm_1"
    ) {
      attachedPermissionId = "perm_1";
      return new Response(null, { status: 204 });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByLabelText, getByText } = renderWithClient(
    React.createElement(PositionDetailContainer, {
      positionDefinitionId: "pos_role1",
    }),
  );

  await waitFor(() => assert.ok(getByLabelText("Agregar un permiso")));
  // Wait for the permission catalog request to resolve so the <option>
  // actually exists before setting the <select>'s value. Options show the
  // permission's name, never its code.
  await waitFor(() => assert.ok(getByText("Ver el padrón de socios")));
  fireEvent.change(getByLabelText("Agregar un permiso"), {
    target: { value: "perm_1" },
  });
  fireEvent.click(getByText("Agregar"));

  await waitFor(() => assert.equal(attachedPermissionId, "perm_1"));

  tokenManager.clearSession();
});

test("Position detail — detach permission: a 409 (shared role) is explained in plain language", async () => {
  const withRole = position({
    id: "pos_role2",
    defaultRoleCode: "CLUB_PRESIDENT",
  });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions")) {
      return permissionsResponse(["kernel.position.manage"]);
    }
    if (url.pathname.endsWith("/position-definitions"))
      return jsonResponse([withRole]);
    if (url.pathname === "/api/kernel/v1/organizations/org_district1") {
      return jsonResponse(DISTRICT);
    }
    if (url.pathname.endsWith("/position-definitions/pos_role2/permissions"))
      return jsonResponse([PERMISSION]);
    if (url.pathname.endsWith("/permissions") && request.method === "GET")
      return jsonResponse([PERMISSION]);
    if (
      request.method === "DELETE" &&
      url.pathname ===
        "/api/kernel/v1/position-definitions/pos_role2/permissions/perm_1"
    ) {
      return problemResponse(409, "KERNEL_CONFLICT");
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByLabelText, getByText } = renderWithClient(
    React.createElement(PositionDetailContainer, {
      positionDefinitionId: "pos_role2",
    }),
  );

  await waitFor(() =>
    assert.ok(getByLabelText('Quitar "Ver el padrón de socios"')),
  );
  fireEvent.click(getByLabelText('Quitar "Ver el padrón de socios"'));

  await waitFor(() =>
    assert.ok(getByText("No se puede cambiar lo que permite este cargo.")),
  );

  tokenManager.clearSession();
});
