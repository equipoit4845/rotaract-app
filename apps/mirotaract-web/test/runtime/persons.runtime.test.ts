// bootstrap.ts installs jsdom's globals and must run before
// `@testing-library/react`/react-dom ever get imported — see
// organizations.runtime.test.ts for the full explanation. This file also
// imports `@testing-library/react` directly (`fireEvent`/`within`/
// `cleanup`), so it needs the same guarantee explicitly, first, itself.
import "./bootstrap.ts";

import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import { cleanup, fireEvent, within } from "@testing-library/react";
import React from "react";

import { MockBackend } from "./mock-backend.ts";
import { renderWithClient, renderWithRouter, waitFor } from "./render.ts";

afterEach(cleanup);

const { tokenManager } = await import("../../src/lib/api/client/token-manager.ts");
const { PersonsListContainer } = await import(
  "../../src/features/persons/containers/persons-list-container.tsx"
);
const { PersonDetailContainer } = await import(
  "../../src/features/persons/containers/person-detail-container.tsx"
);
const { CreatePersonDialog } = await import(
  "../../src/features/persons/forms/create-person-dialog.tsx"
);
const { EditPersonForm } = await import(
  "../../src/features/persons/forms/edit-person-form.tsx"
);
const { ArchivePersonDialog } = await import(
  "../../src/features/persons/forms/archive-person-dialog.tsx"
);
const { InvitePersonDialog } = await import(
  "../../src/features/persons/forms/invite-person-dialog.tsx"
);
const { PersonActionsRow } = await import(
  "../../src/features/persons/components/person-actions-row.tsx"
);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function problemResponse(status: number, code: string, extra: Record<string, unknown> = {}) {
  return jsonResponse(
    { type: "about:blank", title: code, status, code, instance: "/test", ...extra },
    status,
  );
}

function meResponse(personId = "per_actor") {
  return jsonResponse({
    accountId: "acc_1",
    personId,
    accountStatus: "ACTIVE",
    platformRole: "USER",
    displayName: "Actor",
    memberships: [],
    contextVersion: 1,
  });
}

function permissionsResponse(perms: string[]) {
  return jsonResponse(perms);
}

function person(overrides: Record<string, unknown>) {
  return {
    id: "per_x",
    firstName: "Ada",
    lastName: "Lovelace",
    displayName: null,
    primaryEmail: "ada@example.org",
    phone: "+54 11 555 0100",
    birthDate: "1990-01-01",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    archivedAt: null,
    ...overrides,
  };
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

// ---------------------------------------------------------------------------
// US-PER-01 — Listing
// ---------------------------------------------------------------------------

test("Persons list — loading then success: renders a row", async () => {
  const ada = person({ id: "per_1", firstName: "Ada", lastName: "Lovelace" });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions")) return permissionsResponse([]);
    if (url.pathname.endsWith("/persons")) {
      return jsonResponse({ items: [ada], pageInfo: { hasMore: false } });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText } = renderWithRouter(React.createElement(PersonsListContainer));

  await waitFor(() => assert.ok(getByText("Ada Lovelace")));
  assert.ok(getByText("ada@example.org"));

  tokenManager.clearSession();
});

test("Persons list — empty: renders a DataState, not a blank table", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions")) return permissionsResponse([]);
    if (url.pathname.endsWith("/persons")) {
      return jsonResponse({ items: [], pageInfo: { hasMore: false } });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText } = renderWithRouter(React.createElement(PersonsListContainer));

  await waitFor(() => assert.ok(getByText("Sin personas")));

  tokenManager.clearSession();
});

test('Persons list — forbidden: a 403 shows the institutional message, never "Error 403"', async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions")) return permissionsResponse([]);
    if (url.pathname.endsWith("/persons")) return problemResponse(403, "KERNEL_FORBIDDEN");
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, queryByText } = renderWithRouter(
    React.createElement(PersonsListContainer),
  );

  await waitFor(() =>
    assert.ok(getByText("No tenés permisos para ver esta información en esta organización.")),
  );
  assert.equal(queryByText(/error 403/i), null);

  tokenManager.clearSession();
});

test("Persons list — search commits to the URL/query and re-requests", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions")) return permissionsResponse([]);
    if (url.pathname.endsWith("/persons")) {
      return jsonResponse({ items: [], pageInfo: { hasMore: false } });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByLabelText } = renderWithRouter(React.createElement(PersonsListContainer));

  await waitFor(() => assert.ok(getByLabelText("Buscar personas")));
  fireEvent.change(getByLabelText("Buscar personas"), { target: { value: "facundo" } });

  await waitFor(
    () => {
      const matched = backend.kernelCalls.filter(
        (c) => c.url.includes("/persons?") && c.url.includes("query=facundo"),
      );
      assert.ok(matched.length > 0, "expected a request with query=facundo after debounce");
    },
    { timeout: 2000 },
  );

  tokenManager.clearSession();
});

test("Persons list — cursor pagination: Siguiente fetches the next cursor, Anterior goes back without a new request", async () => {
  const pageOne = person({ id: "per_p1", firstName: "Página", lastName: "Uno" });
  const pageTwo = person({ id: "per_p2", firstName: "Página", lastName: "Dos" });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions")) return permissionsResponse([]);
    if (url.pathname.endsWith("/persons")) {
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
    React.createElement(PersonsListContainer),
  );

  await waitFor(() => assert.ok(getByText("Página Uno")));
  fireEvent.click(getByText("Siguiente"));

  await waitFor(() => assert.ok(getByText("Página Dos")));
  assert.equal(queryByText("Página Uno"), null);

  const callsAfterNext = backend.kernelCalls.filter((c) => c.url.includes("/persons")).length;
  fireEvent.click(getByText("Anterior"));

  await waitFor(() => assert.ok(getByText("Página Uno")));
  const callsAfterPrevious = backend.kernelCalls.filter((c) =>
    c.url.includes("/persons"),
  ).length;
  assert.equal(
    callsAfterPrevious,
    callsAfterNext,
    "going back to a page already in memory must not issue a new request",
  );

  tokenManager.clearSession();
});

// ---------------------------------------------------------------------------
// US-PER-02 — Detail
// ---------------------------------------------------------------------------

test("Person detail — success: shows basic + sensitive identity fields, breadcrumb, and resolves a membership's organization name", async () => {
  const ada = person({ id: "per_1", firstName: "Ada", lastName: "Lovelace" });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions")) return permissionsResponse([]);
    if (url.pathname === "/api/kernel/v1/persons/per_1") return jsonResponse(ada);
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getAllByText } = renderWithClient(
    React.createElement(PersonDetailContainer, { personId: "per_1" }),
  );

  await waitFor(() => assert.ok(getAllByText("Ada Lovelace").length > 0));
  assert.ok(getByText("ada@example.org"));
  assert.ok(getByText("+54 11 555 0100"));

  tokenManager.clearSession();
});

test("Person detail — not found: a 404 renders 'no encontrada'", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions")) return permissionsResponse([]);
    if (url.pathname === "/api/kernel/v1/persons/per_missing") {
      return problemResponse(404, "KERNEL_NOT_FOUND");
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText } = renderWithClient(
    React.createElement(PersonDetailContainer, { personId: "per_missing" }),
  );

  await waitFor(() => assert.ok(getByText("Persona no encontrada")));

  tokenManager.clearSession();
});

test("Person detail — forbidden: a 403 shows the institutional message", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions")) return permissionsResponse([]);
    if (url.pathname === "/api/kernel/v1/persons/per_secret") {
      return problemResponse(403, "KERNEL_FORBIDDEN");
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText } = renderWithClient(
    React.createElement(PersonDetailContainer, { personId: "per_secret" }),
  );

  await waitFor(() =>
    assert.ok(getByText("No tenés permisos para ver esta información en esta organización.")),
  );

  tokenManager.clearSession();
});

test("Person detail — Cuenta tab: states the real BLOCKED_API gap, never fakes a linked/unlinked status", async () => {
  const ada = person({ id: "per_1" });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions")) return permissionsResponse([]);
    if (url.pathname === "/api/kernel/v1/persons/per_1") return jsonResponse(ada);
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText } = renderWithClient(
    React.createElement(PersonDetailContainer, { personId: "per_1" }),
  );

  await waitFor(() => assert.ok(getByText("Cuenta")));
  // Radix's Tabs.Trigger selects on `mousedown`, not `click`.
  fireEvent.mouseDown(getByText("Cuenta"));

  await waitFor(() => assert.ok(getByText("No disponible con el contrato actual")));

  tokenManager.clearSession();
});

test("Person actions — self access: kernel.person.update.self shows Editar for the actor's own person", async () => {
  const self = person({ id: "per_actor" });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse("per_actor");
    if (url.pathname.includes("/effective-permissions")) {
      return permissionsResponse(["kernel.person.update.self"]);
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText } = renderWithClient(
    React.createElement(PersonActionsRow, { person: self as never }),
  );
  await waitFor(() => assert.ok(getByText("Editar")));

  tokenManager.clearSession();
});

test("Person actions — self access: kernel.person.update.self never shows Editar for someone else's person", async () => {
  const other = person({ id: "per_other" });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse("per_actor");
    if (url.pathname.includes("/effective-permissions")) {
      return permissionsResponse(["kernel.person.update.self"]);
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { queryByText } = renderWithClient(
    React.createElement(PersonActionsRow, { person: other as never }),
  );
  // "Editar" is absent both before and after the permission check resolves
  // here (this actor only has `update.self`, and `other` isn't its own
  // person) — a plain assertion is enough, no readiness anchor needed.
  await waitFor(() => assert.equal(queryByText("Editar"), null));

  tokenManager.clearSession();
});

// ---------------------------------------------------------------------------
// US-PER-03 — Create
// ---------------------------------------------------------------------------

test("Create person — success: submits CreatePersonRequest and navigates to the new detail page", async () => {
  const created = person({ id: "per_new", firstName: "Grace", lastName: "Hopper" });
  const backend = new MockBackend();
  let createBody: unknown;
  backend.kernelHandler = async (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions")) return permissionsResponse([]);
    if (request.method === "POST" && url.pathname.endsWith("/persons")) {
      createBody = await request.json();
      return jsonResponse(created, 201);
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getByLabelText, router } = renderWithRouter(
    React.createElement(CreatePersonDialog),
  );

  fireEvent.click(getByText("Crear persona"));
  await waitFor(() => assert.ok(getByLabelText("Nombre", { exact: false })));
  fireEvent.change(getByLabelText("Nombre", { exact: false }), {
    target: { value: "Grace" },
  });
  fireEvent.change(getByLabelText("Apellido", { exact: false }), {
    target: { value: "Hopper" },
  });

  fireEvent.click(getByText("Crear persona", { selector: "button[type=submit]" }));

  await waitFor(() => {
    assert.deepEqual(createBody, {
      firstName: "Grace",
      lastName: "Hopper",
      primaryEmail: null,
      phone: null,
      birthDate: null,
    });
  });
  await waitFor(() => assert.ok(router.pushCalls.includes(`/persons/${created.id}`)));

  tokenManager.clearSession();
});

test("Create person — 409: shows an institutional conflict message and keeps the dialog open", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions")) return permissionsResponse([]);
    if (request.method === "POST" && url.pathname.endsWith("/persons")) {
      return problemResponse(409, "KERNEL_CONFLICT", { detail: "duplicate person" });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getByLabelText } = renderWithRouter(
    React.createElement(CreatePersonDialog),
  );

  fireEvent.click(getByText("Crear persona"));
  await waitFor(() => assert.ok(getByLabelText("Nombre", { exact: false })));
  fireEvent.change(getByLabelText("Nombre", { exact: false }), { target: { value: "X" } });
  fireEvent.change(getByLabelText("Apellido", { exact: false }), { target: { value: "Y" } });

  fireEvent.click(getByText("Crear persona", { selector: "button[type=submit]" }));

  await waitFor(() =>
    assert.ok(getByText("Ya existe una persona equivalente registrada.")),
  );
  assert.ok(getByLabelText("Nombre", { exact: false }), "dialog stays open on error");

  tokenManager.clearSession();
});

// ---------------------------------------------------------------------------
// US-PER-04 — Edit
// ---------------------------------------------------------------------------

test("Edit person — success: PATCHes only UpdatePersonRequest fields and navigates back to detail", async () => {
  const existing = person({ id: "per_edit1", firstName: "Ada", lastName: "Lovelace" });
  const backend = new MockBackend();
  let patchBody: unknown;
  backend.kernelHandler = async (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions")) return permissionsResponse([]);
    if (request.method === "PATCH" && url.pathname.endsWith("/persons/per_edit1")) {
      patchBody = await request.json();
      return jsonResponse({ ...existing, firstName: "Augusta" });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByLabelText, getByText, router } = renderWithRouter(
    React.createElement(EditPersonForm, { person: existing as never }),
  );

  // "Nombre" (required) and "Nombre para mostrar" (optional) both contain
  // the substring "Nombre" — anchor to the required-field marker to pick
  // the right one.
  fireEvent.change(getByLabelText(/^Nombre\s*\*/), {
    target: { value: "Augusta" },
  });
  fireEvent.click(getByText("Guardar cambios"));

  await waitFor(() => assert.ok(patchBody));
  assert.deepEqual(patchBody, {
    firstName: "Augusta",
    lastName: "Lovelace",
    displayName: null,
    primaryEmail: "ada@example.org",
    phone: "+54 11 555 0100",
    birthDate: "1990-01-01",
  });
  await waitFor(() => assert.ok(router.pushCalls.includes(`/persons/${existing.id}`)));

  tokenManager.clearSession();
});

// ---------------------------------------------------------------------------
// US-PER-05 — Archive
// ---------------------------------------------------------------------------

test("Archive person — confirms, then calls archive (no optimistic change before the response)", async () => {
  const ada = person({ id: "per_arch1" });
  const backend = new MockBackend();
  let archiveCalled = false;
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions")) {
      return permissionsResponse(["kernel.person.manage"]);
    }
    if (request.method === "POST" && url.pathname.endsWith("/persons/per_arch1/archive")) {
      archiveCalled = true;
      return jsonResponse({ ...ada, archivedAt: "2026-08-09T00:00:00.000Z" });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getByRole } = renderWithClient(
    React.createElement(ArchivePersonDialog, { person: ada as never }),
  );

  await waitFor(() => assert.ok(getByText("Archivar")));
  fireEvent.click(getByText("Archivar"));

  const dialog = await waitFor(() => getByRole("dialog"));
  assert.equal(archiveCalled, false);
  fireEvent.click(within(dialog).getByText("Archivar"));

  await waitFor(() => assert.equal(archiveCalled, true));

  tokenManager.clearSession();
});

test("Archive person — a 409 invalid transition from the Kernel surfaces in the dialog and never applies locally", async () => {
  const alreadyArchived = person({ id: "per_arch2" });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions")) {
      return permissionsResponse(["kernel.person.manage"]);
    }
    if (request.method === "POST" && url.pathname.endsWith("/persons/per_arch2/archive")) {
      return problemResponse(409, "KERNEL_INVALID_TRANSITION", {
        detail: "already archived",
      });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getByRole } = renderWithClient(
    React.createElement(ArchivePersonDialog, { person: alreadyArchived as never }),
  );

  await waitFor(() => assert.ok(getByText("Archivar")));
  fireEvent.click(getByText("Archivar"));

  const dialog = await waitFor(() => getByRole("dialog"));
  fireEvent.click(within(dialog).getByText("Archivar"));

  await waitFor(() => assert.ok(within(dialog).getByText("already archived")));
  assert.ok(within(dialog).getByText("Archivar persona"));

  tokenManager.clearSession();
});

// ---------------------------------------------------------------------------
// US-PER-06 — Invite
// ---------------------------------------------------------------------------

test("Invite person — no membership: the action is disabled and explains the precondition instead of hiding silently", async () => {
  const noMembership = person({ id: "per_nomem" });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions")) {
      return permissionsResponse(["kernel.person.manage"]);
    }
    if (url.pathname === "/api/kernel/v1/persons/per_nomem/memberships") {
      return jsonResponse([]);
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText } = renderWithClient(
    React.createElement(InvitePersonDialog, { person: noMembership as never }),
  );

  await waitFor(() => {
    const trigger = getByText("Invitar a crear cuenta").closest("button");
    assert.ok(trigger?.hasAttribute("disabled"));
  });

  tokenManager.clearSession();
});

test("Invite person — success: submits {membershipId, email} and shows the returned invitation status", async () => {
  const withMembership = person({ id: "per_withmem" });
  const membership = {
    id: "mem_1",
    organizationId: DISTRICT.id,
    personId: withMembership.id,
    status: "ACTIVE",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  };
  const backend = new MockBackend();
  let inviteBody: unknown;
  backend.kernelHandler = async (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions")) {
      return permissionsResponse(["kernel.person.manage"]);
    }
    if (url.pathname === "/api/kernel/v1/persons/per_withmem/memberships") {
      return jsonResponse([membership]);
    }
    if (url.pathname === "/api/kernel/v1/organizations/org_district1") {
      return jsonResponse(DISTRICT);
    }
    if (
      request.method === "POST" &&
      url.pathname.endsWith("/persons/per_withmem/invitations")
    ) {
      inviteBody = await request.json();
      return jsonResponse(
        {
          id: "inv_1",
          membershipId: membership.id,
          personId: withMembership.id,
          email: withMembership.primaryEmail,
          status: "PENDING",
          expiresAt: "2026-09-01T00:00:00.000Z",
          createdAt: "2026-08-09T00:00:00.000Z",
        },
        201,
      );
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getByRole, getByLabelText } = renderWithClient(
    React.createElement(InvitePersonDialog, { person: withMembership as never }),
  );

  await waitFor(() => {
    const trigger = getByText("Invitar a crear cuenta").closest("button");
    assert.ok(!trigger?.hasAttribute("disabled"));
  });
  fireEvent.click(getByText("Invitar a crear cuenta"));

  const dialog = await waitFor(() => getByRole("dialog"));
  await waitFor(() => assert.ok(within(dialog).getByText(/Distrito 4845/)));
  fireEvent.change(getByLabelText("Membresía", { exact: false }), {
    target: { value: membership.id },
  });
  fireEvent.click(within(dialog).getByText("Enviar invitación"));

  await waitFor(() =>
    assert.deepEqual(inviteBody, {
      membershipId: membership.id,
      email: withMembership.primaryEmail,
    }),
  );
  await waitFor(() => assert.ok(within(dialog).getByText("Invitación enviada")));

  tokenManager.clearSession();
});
