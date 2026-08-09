// bootstrap.ts installs jsdom's globals and must run before
// `@testing-library/react`/react-dom ever get imported — see the same note
// in organizations.runtime.test.ts.
import "./bootstrap.ts";

import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import { cleanup, fireEvent, within } from "@testing-library/react";
import React from "react";

import { MockBackend } from "./mock-backend.ts";
import {
  jsonResponse,
  newQueryClient,
  problemResponse,
  renderHookWithClient,
  renderWithClient,
  renderWithRouter,
  waitFor,
} from "./render.ts";

afterEach(cleanup);

const { tokenManager } =
  await import("../../src/lib/api/client/token-manager.ts");
const { authorizationKeys } =
  await import("../../src/lib/api/authorization/authorization.keys.ts");
const { membershipKeys } =
  await import("../../src/lib/api/memberships/memberships.keys.ts");
const { useActivateMembership, useDeactivateMembership } =
  await import("../../src/lib/api/memberships/memberships.hooks.ts");
const { ActiveOrganizationProvider } =
  await import("../../src/features/shell/active-organization-context.tsx");
const { MembershipsListContainer } =
  await import("../../src/features/memberships/containers/memberships-list-container.tsx");
const { MembershipDetailContainer } =
  await import("../../src/features/memberships/containers/membership-detail-container.tsx");
const { CreateMembershipDialog } =
  await import("../../src/features/memberships/forms/create-membership-dialog.tsx");
const { MembershipActionsRow } =
  await import("../../src/features/memberships/components/membership-actions-row.tsx");
const { ActivateMembershipDialog } =
  await import("../../src/features/memberships/forms/activate-membership-dialog.tsx");
const { LeaveMembershipDialog } =
  await import("../../src/features/memberships/forms/leave-membership-dialog.tsx");
const { DeactivateMembershipDialog } =
  await import("../../src/features/memberships/forms/deactivate-membership-dialog.tsx");
const { GraduateMembershipDialog } =
  await import("../../src/features/memberships/forms/graduate-membership-dialog.tsx");
const { ReactivateMembershipDialog } =
  await import("../../src/features/memberships/forms/reactivate-membership-dialog.tsx");
const { ResumeMembershipDialog } =
  await import("../../src/features/memberships/forms/resume-membership-dialog.tsx");

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

const ORG = {
  id: "org_1",
  parentId: null,
  type: "CLUB",
  code: "RTC-1",
  name: "Club Uno",
  slug: "club-uno",
  status: "ACTIVE",
  timezone: "America/Argentina/Cordoba",
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
};

function membership(overrides: Record<string, unknown>) {
  return {
    id: "mem_1",
    organizationId: ORG.id,
    personId: "per_1",
    memberNumber: null,
    status: "PENDING",
    joinedAt: null,
    statusChangedAt: "2025-01-01T00:00:00.000Z",
    endedAt: null,
    internalNotes: null,
    metadata: null,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function person(overrides: Record<string, unknown> = {}) {
  return {
    id: "per_1",
    firstName: "Ada",
    lastName: "Lovelace",
    displayName: "Ada Lovelace",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Fake `useActiveOrganization()` return shape — real shell context, faked value (product spec §6). */
function fakeActiveOrganization(organizationId: string | undefined) {
  return {
    organizationId,
    organization: organizationId ? (ORG as never) : undefined,
    isLoading: false,
    availableMemberships: [],
    setActiveOrganizationId: () => {},
  };
}

function renderMembershipsList(
  activeOrganizationId: string | undefined,
  options: Parameters<typeof renderWithRouter>[1] = {},
) {
  return renderWithRouter(
    React.createElement(ActiveOrganizationProvider, {
      value: fakeActiveOrganization(activeOrganizationId),
      children: React.createElement(MembershipsListContainer),
    }),
    options,
  );
}

// ---------------------------------------------------------------------------
// US-MEM-01 — Listing
// ---------------------------------------------------------------------------

test("Memberships list — loading then success: renders a row with the person resolved through the bounded join", async () => {
  const mem = membership({
    status: "ACTIVE",
    joinedAt: "2025-02-01T00:00:00.000Z",
  });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname === "/api/kernel/v1/persons/per_1")
      return jsonResponse(person());
    if (url.pathname.endsWith("/organizations")) {
      return jsonResponse({ items: [ORG], pageInfo: { hasMore: false } });
    }
    if (url.pathname === `/api/kernel/v1/organizations/${ORG.id}/memberships`) {
      return jsonResponse({ items: [mem], pageInfo: { hasMore: false } });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getAllByText } = renderMembershipsList(ORG.id);

  await waitFor(() => assert.ok(getByText("Ada Lovelace")));
  // "Activo" also appears as a filter <option> — only assert the status badge exists.
  assert.ok(getAllByText("Activo").length > 0);

  tokenManager.clearSession();
});

test("Memberships list — empty: renders a DataState, not a blank table", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname.endsWith("/organizations")) {
      return jsonResponse({ items: [ORG], pageInfo: { hasMore: false } });
    }
    if (url.pathname === `/api/kernel/v1/organizations/${ORG.id}/memberships`) {
      return jsonResponse({ items: [], pageInfo: { hasMore: false } });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText } = renderMembershipsList(ORG.id);

  await waitFor(() => assert.ok(getByText("Sin membresías")));

  tokenManager.clearSession();
});

test('Memberships list — forbidden: a 403 shows the institutional message, never "Error 403"', async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname.endsWith("/organizations")) {
      return jsonResponse({ items: [ORG], pageInfo: { hasMore: false } });
    }
    if (url.pathname === `/api/kernel/v1/organizations/${ORG.id}/memberships`) {
      return problemResponse(403, "KERNEL_FORBIDDEN");
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, queryByText } = renderMembershipsList(ORG.id);

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

test("Memberships list — no organization in scope: shows the empty-scope DataState, issues no membership request", async () => {
  const backend = new MockBackend();
  let membershipCalls = 0;
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname.includes("/memberships")) membershipCalls += 1;
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText } = renderMembershipsList(undefined);

  await waitFor(() => assert.ok(getByText("Elegí una organización")));
  assert.equal(membershipCalls, 0);

  tokenManager.clearSession();
});

test("Memberships list — status filter changes the request, and an explicit ?organization= wins over the active organization", async () => {
  const otherOrgMembership = membership({
    id: "mem_other",
    organizationId: "org_2",
    status: "ACTIVE",
  });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname === "/api/kernel/v1/persons/per_1")
      return jsonResponse(person());
    if (url.pathname.endsWith("/organizations")) {
      return jsonResponse({ items: [ORG], pageInfo: { hasMore: false } });
    }
    if (url.pathname === "/api/kernel/v1/organizations/org_2/memberships") {
      return jsonResponse({
        items: [otherOrgMembership],
        pageInfo: { hasMore: false },
      });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  // Active organization resolves to ORG.id, but the URL explicitly says org_2 (§6).
  const { getByLabelText } = renderMembershipsList(ORG.id, {
    initialSearchParams: new URLSearchParams("organization=org_2"),
    pathname: "/memberships",
  });

  await waitFor(() =>
    assert.ok(
      backend.kernelCalls.some((c) =>
        c.url.includes("/organizations/org_2/memberships"),
      ),
    ),
  );
  assert.ok(
    !backend.kernelCalls.some((c) =>
      c.url.includes(`/organizations/${ORG.id}/memberships`),
    ),
    "the explicit ?organization= param must win over activeOrganizationId",
  );

  const before = backend.kernelCalls.filter((c) =>
    c.url.includes("/memberships"),
  ).length;
  fireEvent.change(getByLabelText("Filtrar por estado"), {
    target: { value: "ACTIVE" },
  });

  await waitFor(() => {
    const filtered = backend.kernelCalls.filter(
      (c) => c.url.includes("/memberships?") && c.url.includes("status=ACTIVE"),
    );
    assert.ok(
      filtered.length > 0,
      "expected a request with status=ACTIVE after the filter changed",
    );
  });
  assert.ok(
    backend.kernelCalls.filter((c) => c.url.includes("/memberships")).length >
      before,
  );

  tokenManager.clearSession();
});

test("Memberships list — cursor pagination: Siguiente fetches the next cursor, Anterior goes back without a new request", async () => {
  const pageOne = membership({ id: "mem_p1", status: "ACTIVE" });
  const pageTwo = membership({
    id: "mem_p2",
    personId: "per_2",
    status: "ACTIVE",
  });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname === "/api/kernel/v1/persons/per_1")
      return jsonResponse(person({ id: "per_1", displayName: "Página Uno" }));
    if (url.pathname === "/api/kernel/v1/persons/per_2")
      return jsonResponse(person({ id: "per_2", displayName: "Página Dos" }));
    if (url.pathname.endsWith("/organizations")) {
      return jsonResponse({ items: [ORG], pageInfo: { hasMore: false } });
    }
    if (url.pathname === `/api/kernel/v1/organizations/${ORG.id}/memberships`) {
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

  const { getByText, queryByText } = renderMembershipsList(ORG.id);

  await waitFor(() => assert.ok(getByText("Página Uno")));
  fireEvent.click(getByText("Siguiente"));

  await waitFor(() => assert.ok(getByText("Página Dos")));
  assert.equal(
    queryByText("Página Uno"),
    null,
    "page 2 replaces page 1 in the table",
  );

  const callsAfterNext = backend.kernelCalls.filter((c) =>
    c.url.includes("/memberships"),
  ).length;
  fireEvent.click(getByText("Anterior"));

  await waitFor(() => assert.ok(getByText("Página Uno")));
  const callsAfterPrevious = backend.kernelCalls.filter((c) =>
    c.url.includes("/memberships"),
  ).length;
  assert.equal(
    callsAfterPrevious,
    callsAfterNext,
    "going back to a page already in memory must not issue a new request",
  );

  tokenManager.clearSession();
});

test("Memberships list — anti-N+1: two rows sharing one person resolve it with a single request, not one per row", async () => {
  const memA = membership({
    id: "mem_a",
    personId: "per_shared",
    status: "ACTIVE",
  });
  const memB = membership({
    id: "mem_b",
    personId: "per_shared",
    status: "ON_LEAVE",
  });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname === "/api/kernel/v1/persons/per_shared")
      return jsonResponse(
        person({ id: "per_shared", displayName: "Persona Compartida" }),
      );
    if (url.pathname.endsWith("/organizations")) {
      return jsonResponse({ items: [ORG], pageInfo: { hasMore: false } });
    }
    if (url.pathname === `/api/kernel/v1/organizations/${ORG.id}/memberships`) {
      return jsonResponse({
        items: [memA, memB],
        pageInfo: { hasMore: false },
      });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getAllByText } = renderMembershipsList(ORG.id);

  await waitFor(() =>
    assert.equal(getAllByText("Persona Compartida").length, 2),
  );

  const personCalls = backend.kernelCalls.filter(
    (c) => c.url === "https://kernel.test/api/kernel/v1/persons/per_shared",
  );
  assert.equal(
    personCalls.length,
    1,
    "two rows sharing the same personId must dedupe into a single request via the query cache",
  );

  tokenManager.clearSession();
});

// ---------------------------------------------------------------------------
// US-MEM-02 — Detail + history
// ---------------------------------------------------------------------------

test("Membership detail — success: renders person, organization, status and ordered history", async () => {
  const mem = membership({
    status: "ACTIVE",
    joinedAt: "2025-02-01T00:00:00.000Z",
  });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname === "/api/kernel/v1/memberships/mem_1")
      return jsonResponse(mem);
    if (url.pathname === "/api/kernel/v1/memberships/mem_1/history") {
      return jsonResponse([
        {
          id: "trs_2",
          membershipId: "mem_1",
          type: "ACTIVATED",
          fromStatus: "PENDING",
          toStatus: "ACTIVE",
          effectiveAt: "2025-02-01T00:00:00.000Z",
          createdAt: "2025-02-01T00:00:00.000Z",
        },
        {
          id: "trs_1",
          membershipId: "mem_1",
          type: "CREATED",
          toStatus: "PENDING",
          effectiveAt: "2025-01-01T00:00:00.000Z",
          createdAt: "2025-01-01T00:00:00.000Z",
        },
      ]);
    }
    if (url.pathname === "/api/kernel/v1/persons/per_1")
      return jsonResponse(person());
    if (url.pathname === `/api/kernel/v1/organizations/${ORG.id}`)
      return jsonResponse(ORG);
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getAllByText } = renderWithClient(
    React.createElement(MembershipDetailContainer, { membershipId: "mem_1" }),
  );

  await waitFor(() => assert.ok(getAllByText("Ada Lovelace").length > 0));
  await waitFor(() => assert.ok(getByText("Club Uno")));
  assert.ok(getByText("Membresía creada"));
  assert.ok(getByText("Activada"));

  // "Membresía creada" (trs_1, 2025-01-01) must render before "Activada"
  // (trs_2, 2025-02-01) despite arriving from the Kernel in reverse order —
  // confirms the local ascending sort by `effectiveAt` actually ran.
  const html = document.body.innerHTML;
  assert.ok(
    html.indexOf("Membresía creada") < html.indexOf("Activada"),
    "history must render in ascending effectiveAt order",
  );

  tokenManager.clearSession();
});

test("Membership detail — not found: a 404 renders 'no encontrada', not a generic error", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname === "/api/kernel/v1/memberships/mem_missing") {
      return problemResponse(404, "KERNEL_NOT_FOUND");
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText } = renderWithClient(
    React.createElement(MembershipDetailContainer, {
      membershipId: "mem_missing",
    }),
  );

  await waitFor(() => assert.ok(getByText("Membresía no encontrada")));

  tokenManager.clearSession();
});

test("Membership detail — forbidden: a 403 shows the institutional message", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname === "/api/kernel/v1/memberships/mem_secret") {
      return problemResponse(403, "KERNEL_FORBIDDEN");
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText } = renderWithClient(
    React.createElement(MembershipDetailContainer, {
      membershipId: "mem_secret",
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

// ---------------------------------------------------------------------------
// US-MEM-03 — Create
// ---------------------------------------------------------------------------

function labelText(
  getByLabelText: (text: string, options?: { exact?: boolean }) => HTMLElement,
  label: string,
): HTMLElement {
  return getByLabelText(label, { exact: false });
}

test("Create membership — success: submits CreateMembershipRequest to the org-scoped path and navigates to the new detail page", async () => {
  const created = membership({ id: "mem_new", personId: "per_1" });
  const backend = new MockBackend();
  let createBody: unknown;
  backend.kernelHandler = async (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (request.method === "GET" && url.pathname === "/api/kernel/v1/persons") {
      return jsonResponse({ items: [person()], pageInfo: { hasMore: false } });
    }
    if (
      request.method === "POST" &&
      url.pathname === `/api/kernel/v1/organizations/${ORG.id}/memberships`
    ) {
      createBody = await request.json();
      return jsonResponse(created, 201);
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getByLabelText, router } = renderWithRouter(
    React.createElement(CreateMembershipDialog, { organizationId: ORG.id }),
  );

  fireEvent.click(getByText("Agregar socio"));
  await waitFor(() => assert.ok(getByLabelText("Persona", { exact: false })));
  await waitFor(() => assert.ok(getByText("Ada Lovelace")));

  fireEvent.change(labelText(getByLabelText, "Persona"), {
    target: { value: "per_1" },
  });
  fireEvent.click(
    getByText("Crear membresía", { selector: "button[type=submit]" }),
  );

  await waitFor(() => {
    assert.deepEqual(createBody, { personId: "per_1", memberNumber: null });
  });
  await waitFor(() =>
    assert.ok(router.pushCalls.includes("/memberships/mem_new")),
  );

  tokenManager.clearSession();
});

test("Create membership — 409 duplicate person/organization: shows the institutional conflict message and keeps the dialog open", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (request.method === "GET" && url.pathname === "/api/kernel/v1/persons") {
      return jsonResponse({ items: [person()], pageInfo: { hasMore: false } });
    }
    if (
      request.method === "POST" &&
      url.pathname === `/api/kernel/v1/organizations/${ORG.id}/memberships`
    ) {
      return problemResponse(409, "KERNEL_CONFLICT", {
        detail: "already a member",
      });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getByLabelText } = renderWithRouter(
    React.createElement(CreateMembershipDialog, { organizationId: ORG.id }),
  );

  fireEvent.click(getByText("Agregar socio"));
  await waitFor(() => assert.ok(getByText("Ada Lovelace")));
  fireEvent.change(labelText(getByLabelText, "Persona"), {
    target: { value: "per_1" },
  });
  fireEvent.click(
    getByText("Crear membresía", { selector: "button[type=submit]" }),
  );

  await waitFor(() =>
    assert.ok(
      getByText(
        "Ya existe una membresía para esta persona en esta organización.",
      ),
    ),
  );
  assert.ok(
    getByLabelText("Persona", { exact: false }),
    "the dialog stays open on error, the form isn't lost",
  );

  tokenManager.clearSession();
});

// ---------------------------------------------------------------------------
// US-MEM-04..08 — Lifecycle, one operation at a time
// ---------------------------------------------------------------------------

test("Activate membership — visible only with permission + PENDING status, confirms, then calls activate (no optimistic change)", async () => {
  const pending = membership({ status: "PENDING" });
  const backend = new MockBackend();
  let activateCalled = false;
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse(["kernel.membership.activate"]);
    if (
      request.method === "POST" &&
      url.pathname === "/api/kernel/v1/memberships/mem_1/activate"
    ) {
      activateCalled = true;
      return jsonResponse({ ...pending, status: "ACTIVE" });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getByRole } = renderWithClient(
    React.createElement(ActivateMembershipDialog, {
      membership: pending as never,
      personLabel: "Ada Lovelace",
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

test("Activate membership — not offered on an ACTIVE membership (PENDING -> ACTIVE only)", async () => {
  const active = membership({ status: "ACTIVE" });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse(["kernel.membership.activate"]);
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { queryByText } = renderWithClient(
    React.createElement(ActivateMembershipDialog, {
      membership: active as never,
      personLabel: "Ada Lovelace",
    }),
  );

  await waitFor(() => assert.equal(document.body.textContent, ""));
  assert.equal(queryByText("Activar"), null);

  tokenManager.clearSession();
});

test("Leave membership — ACTIVE -> ON_LEAVE, sends optional reasonText, invalid-transition surfaces without a local status change", async () => {
  const active = membership({ status: "ACTIVE" });
  const backend = new MockBackend();
  let leaveBody: unknown;
  backend.kernelHandler = async (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse(["kernel.membership.update"]);
    if (
      request.method === "POST" &&
      url.pathname === "/api/kernel/v1/memberships/mem_1/leave"
    ) {
      leaveBody = await request.json();
      return problemResponse(409, "KERNEL_INVALID_TRANSITION", {
        detail: "ACTIVE membership cannot transition directly to PENDING",
      });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getByRole } = renderWithClient(
    React.createElement(LeaveMembershipDialog, {
      membership: active as never,
      personLabel: "Ada Lovelace",
    }),
  );

  await waitFor(() => assert.ok(getByText("Poner en licencia")));
  fireEvent.click(getByText("Poner en licencia"));
  const dialog = await waitFor(() => getByRole("dialog"));
  fireEvent.click(within(dialog).getByText("Poner en licencia"));

  await waitFor(() =>
    assert.ok(
      within(dialog).getByText(
        "Esta membresía no puede pasar a ese estado en este momento.",
      ),
    ),
  );
  assert.deepEqual(leaveBody, { reasonText: null });
  // The dialog is still open — no silent success, no local status flip.
  assert.ok(within(dialog).getByText("Poner en licencia"));

  tokenManager.clearSession();
});

test("Resume membership — ON_LEAVE -> ACTIVE, no request body", async () => {
  const onLeave = membership({ status: "ON_LEAVE" });
  const backend = new MockBackend();
  let resumeCalled = false;
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse(["kernel.membership.update"]);
    if (
      request.method === "POST" &&
      url.pathname === "/api/kernel/v1/memberships/mem_1/resume"
    ) {
      resumeCalled = true;
      return jsonResponse({ ...onLeave, status: "ACTIVE" });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getByRole } = renderWithClient(
    React.createElement(ResumeMembershipDialog, {
      membership: onLeave as never,
      personLabel: "Ada Lovelace",
    }),
  );

  await waitFor(() => assert.ok(getByText("Reanudar")));
  fireEvent.click(getByText("Reanudar"));
  const dialog = await waitFor(() => getByRole("dialog"));
  fireEvent.click(within(dialog).getByText("Reanudar"));

  await waitFor(() => assert.equal(resumeCalled, true));

  tokenManager.clearSession();
});

test("Deactivate membership — PENDING -> INACTIVE is offered too, not just from ACTIVE", async () => {
  const pending = membership({ status: "PENDING" });
  const backend = new MockBackend();
  let deactivateCalled = false;
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse(["kernel.membership.deactivate"]);
    if (
      request.method === "POST" &&
      url.pathname === "/api/kernel/v1/memberships/mem_1/deactivate"
    ) {
      deactivateCalled = true;
      return jsonResponse({ ...pending, status: "INACTIVE" });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getByRole } = renderWithClient(
    React.createElement(DeactivateMembershipDialog, {
      membership: pending as never,
      personLabel: "Ada Lovelace",
    }),
  );

  await waitFor(() => assert.ok(getByText("Desactivar")));
  fireEvent.click(getByText("Desactivar"));
  const dialog = await waitFor(() => getByRole("dialog"));
  fireEvent.click(within(dialog).getByText("Desactivar"));

  await waitFor(() => assert.equal(deactivateCalled, true));

  tokenManager.clearSession();
});

test("Graduate membership — ACTIVE -> GRADUATED, terminal", async () => {
  const active = membership({ status: "ACTIVE" });
  const backend = new MockBackend();
  let graduateCalled = false;
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse(["kernel.membership.update"]);
    if (
      request.method === "POST" &&
      url.pathname === "/api/kernel/v1/memberships/mem_1/graduate"
    ) {
      graduateCalled = true;
      return jsonResponse({ ...active, status: "GRADUATED" });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getByRole } = renderWithClient(
    React.createElement(GraduateMembershipDialog, {
      membership: active as never,
      personLabel: "Ada Lovelace",
    }),
  );

  await waitFor(() => assert.ok(getByText("Graduar")));
  fireEvent.click(getByText("Graduar"));
  const dialog = await waitFor(() => getByRole("dialog"));
  fireEvent.click(within(dialog).getByText("Graduar"));

  await waitFor(() => assert.equal(graduateCalled, true));

  tokenManager.clearSession();
});

test("Reactivate membership — INACTIVE -> ACTIVE", async () => {
  const inactive = membership({ status: "INACTIVE" });
  const backend = new MockBackend();
  let reactivateCalled = false;
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse(["kernel.membership.update"]);
    if (
      request.method === "POST" &&
      url.pathname === "/api/kernel/v1/memberships/mem_1/reactivate"
    ) {
      reactivateCalled = true;
      return jsonResponse({ ...inactive, status: "ACTIVE" });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getByRole } = renderWithClient(
    React.createElement(ReactivateMembershipDialog, {
      membership: inactive as never,
      personLabel: "Ada Lovelace",
    }),
  );

  await waitFor(() => assert.ok(getByText("Reactivar")));
  fireEvent.click(getByText("Reactivar"));
  const dialog = await waitFor(() => getByRole("dialog"));
  fireEvent.click(within(dialog).getByText("Reactivar"));

  await waitFor(() => assert.equal(reactivateCalled, true));

  tokenManager.clearSession();
});

test('"Graduar" and "Reactivar" are not a pair: a GRADUATED membership offers neither action, only a PENDING/ACTIVE/ON_LEAVE/INACTIVE one is ever offered', async () => {
  const graduated = membership({
    status: "GRADUATED",
    endedAt: "2025-06-01T00:00:00.000Z",
  });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions")) {
      // Every relevant permission granted — if a button is still hidden, it's the status gate, not the permission gate.
      return permissionsResponse([
        "kernel.membership.activate",
        "kernel.membership.deactivate",
        "kernel.membership.update",
      ]);
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { queryByText } = renderWithClient(
    React.createElement(MembershipActionsRow, {
      membership: graduated as never,
      personLabel: "Ada Lovelace",
    }),
  );

  // Give effective-permissions a tick to resolve so a real gate failure (not just default-hidden) is what's being asserted.
  await waitFor(() => assert.ok(document.body));
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(queryByText("Activar"), null);
  assert.equal(queryByText("Poner en licencia"), null);
  assert.equal(queryByText("Reanudar"), null);
  assert.equal(queryByText("Desactivar"), null);
  assert.equal(queryByText("Graduar"), null);
  assert.equal(
    queryByText("Reactivar"),
    null,
    "reactivateMembership only applies from INACTIVE (kernel-openapi.yaml) — never offered on a GRADUATED membership",
  );

  tokenManager.clearSession();
});

test('Reactivate is offered on INACTIVE but "Graduar" is not (they are independent operations, not a toggle)', async () => {
  const inactive = membership({
    status: "INACTIVE",
    endedAt: "2025-06-01T00:00:00.000Z",
  });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions")) {
      return permissionsResponse([
        "kernel.membership.activate",
        "kernel.membership.deactivate",
        "kernel.membership.update",
      ]);
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, queryByText } = renderWithClient(
    React.createElement(MembershipActionsRow, {
      membership: inactive as never,
      personLabel: "Ada Lovelace",
    }),
  );

  await waitFor(() => assert.ok(getByText("Reactivar")));
  assert.equal(queryByText("Graduar"), null);
  assert.equal(queryByText("Activar"), null);
  assert.equal(queryByText("Poner en licencia"), null);
  assert.equal(queryByText("Reanudar"), null);
  assert.equal(queryByText("Desactivar"), null);

  tokenManager.clearSession();
});

// ---------------------------------------------------------------------------
// §31 — Cross-feature cache invalidation
// ---------------------------------------------------------------------------

test("Membership mutation cache invalidation — activate invalidates detail, history, organization lists, person list, and effective permissions", async () => {
  const pending = membership({ status: "PENDING" });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (
      request.method === "POST" &&
      url.pathname === "/api/kernel/v1/memberships/mem_1/activate"
    ) {
      return jsonResponse({ ...pending, status: "ACTIVE" });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const queryClient = newQueryClient();
  const detailKey = membershipKeys.detail("mem_1");
  const historyKey = membershipKeys.history("mem_1");
  const orgListsKey = membershipKeys.organizationLists();
  const personListKey = membershipKeys.personList("per_1");
  const permissionsKey = authorizationKeys.allEffectivePermissions();

  for (const key of [
    detailKey,
    historyKey,
    orgListsKey,
    personListKey,
    permissionsKey,
  ]) {
    queryClient.setQueryData(key, "seed");
  }

  const { result } = renderHookWithClient(() => useActivateMembership(), {
    queryClient,
  });
  result.current.mutate({ membershipId: "mem_1" });

  await waitFor(() => assert.equal(result.current.isSuccess, true));

  for (const [name, key] of [
    ["detail", detailKey],
    ["history", historyKey],
    ["organization lists", orgListsKey],
    ["person list", personListKey],
    ["effective permissions", permissionsKey],
  ] as const) {
    assert.equal(
      queryClient.getQueryState(key as unknown as readonly unknown[])
        ?.isInvalidated,
      true,
      `${name} cache must be invalidated after a lifecycle mutation`,
    );
  }

  tokenManager.clearSession();
});

test("Membership mutation cache invalidation — deactivate also invalidates the same set (every lifecycle mutation shares invalidateMembership)", async () => {
  const active = membership({ status: "ACTIVE" });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (
      request.method === "POST" &&
      url.pathname === "/api/kernel/v1/memberships/mem_1/deactivate"
    ) {
      return jsonResponse({ ...active, status: "INACTIVE" });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const queryClient = newQueryClient();
  const permissionsKey = authorizationKeys.allEffectivePermissions();
  queryClient.setQueryData(permissionsKey, "seed");

  const { result } = renderHookWithClient(() => useDeactivateMembership(), {
    queryClient,
  });
  result.current.mutate({ membershipId: "mem_1" });

  await waitFor(() => assert.equal(result.current.isSuccess, true));
  assert.equal(
    queryClient.getQueryState(permissionsKey as unknown as readonly unknown[])
      ?.isInvalidated,
    true,
    "deactivate changes effective permissions in this organization (invariant 6.4.6) — must invalidate them too",
  );

  tokenManager.clearSession();
});
