// bootstrap.ts installs jsdom's globals and must run before
// `@testing-library/react`/react-dom ever get imported — see the same note
// in organizations.runtime.test.ts / memberships.runtime.test.ts.
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
  renderWithClient,
  renderWithRouter,
  waitFor,
} from "./render.ts";

afterEach(cleanup);

const { tokenManager } =
  await import("../../src/lib/api/client/token-manager.ts");
const { authorizationKeys } =
  await import("../../src/lib/api/authorization/authorization.keys.ts");
const { ActiveOrganizationProvider, useActiveOrganizationContext } =
  await import("../../src/features/shell/active-organization-context.tsx");
const { PersonDetailContainer } =
  await import("../../src/features/persons/containers/person-detail-container.tsx");
const { PersonMembershipList } =
  await import("../../src/features/persons/components/person-membership-list.tsx");
const { PersonsListContainer } =
  await import("../../src/features/persons/containers/persons-list-container.tsx");
const { MembershipDetailContainer } =
  await import("../../src/features/memberships/containers/membership-detail-container.tsx");
const { MembershipsListContainer } =
  await import("../../src/features/memberships/containers/memberships-list-container.tsx");
const { MembershipsTable } =
  await import("../../src/features/memberships/components/memberships-table.tsx");
const { DeactivateMembershipDialog } =
  await import("../../src/features/memberships/forms/deactivate-membership-dialog.tsx");
const { GraduateMembershipDialog } =
  await import("../../src/features/memberships/forms/graduate-membership-dialog.tsx");
const { ReactivateMembershipDialog } =
  await import("../../src/features/memberships/forms/reactivate-membership-dialog.tsx");
const { CreateMembershipDialog } =
  await import("../../src/features/memberships/forms/create-membership-dialog.tsx");

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

const OTHER_ORG = { ...ORG, id: "org_other", code: "RTC-2", name: "Club Otro" };

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
    primaryEmail: "ada@example.com",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function fakeActiveOrganization(
  organizationId: string | undefined,
  setActiveOrganizationId: (id: string) => void = () => {},
) {
  return {
    organizationId,
    organization: organizationId ? (ORG as never) : undefined,
    isLoading: false,
    availableMemberships: [],
    setActiveOrganizationId,
  };
}

function hrefOf(element: HTMLElement): string | null {
  return element.closest("a")?.getAttribute("href") ?? null;
}

// ---------------------------------------------------------------------------
// 1/2 — Person detail lists Memberships, each linking to /memberships/[id]
// ---------------------------------------------------------------------------

test("Person -> Membership: Person detail's Membresías tab lists real memberships, each linking to /memberships/[id]", async () => {
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
    if (url.pathname === "/api/kernel/v1/persons/per_1/memberships") {
      return jsonResponse([mem]);
    }
    if (url.pathname === `/api/kernel/v1/organizations/${ORG.id}`)
      return jsonResponse(ORG);
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getAllByText } = renderWithClient(
    React.createElement(PersonDetailContainer, { personId: "per_1" }),
  );

  await waitFor(() => assert.ok(getAllByText("Ada Lovelace").length > 0));
  // Radix's Tabs.Trigger selects on `mousedown`, not `click`.
  fireEvent.mouseDown(getByText("Membresías"));

  await waitFor(() => assert.ok(getByText("Club Uno")));
  const detailLink = getByText("Ver detalle");
  assert.equal(hrefOf(detailLink), "/memberships/mem_1");

  tokenManager.clearSession();
});

// ---------------------------------------------------------------------------
// 3/4 — Membership detail links back to Person and to Organization
// ---------------------------------------------------------------------------

test("Membership -> Person / Membership -> Organization: the detail page links both, without leaking Person PII beyond a name", async () => {
  const mem = membership({ status: "ACTIVE" });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname === "/api/kernel/v1/memberships/mem_1")
      return jsonResponse(mem);
    if (url.pathname === "/api/kernel/v1/memberships/mem_1/history")
      return jsonResponse([]);
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

  await waitFor(() => assert.ok(getByText("Club Uno")));
  // Two "Ada Lovelace" occurrences (header title + summary card "Persona" link) is expected.
  const personLinks = getAllByText("Ada Lovelace");
  assert.ok(personLinks.some((el) => hrefOf(el) === "/persons/per_1"));

  const orgLink = getByText("Club Uno");
  assert.equal(hrefOf(orgLink), "/organizations/org_1");

  // No email/phone/birthDate leaked into the Membership summary — PII stays
  // minimal even though the full Person DTO is in hand (product spec §15).
  assert.equal(document.body.textContent?.includes("ada@example.com"), false);

  tokenManager.clearSession();
});

// ---------------------------------------------------------------------------
// 5..8 — Membership mutations refresh Person's Membresías tab
// ---------------------------------------------------------------------------

test("create Membership -> Person memberships updates: PersonMembershipList refetches after useCreateMembership succeeds, no manual cache write", async () => {
  let personMemberships: Record<string, unknown>[] = [];
  const created = membership({ id: "mem_new", status: "PENDING" });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (request.method === "GET" && url.pathname === "/api/kernel/v1/persons") {
      return jsonResponse({ items: [person()], pageInfo: { hasMore: false } });
    }
    if (url.pathname === "/api/kernel/v1/persons/per_1/memberships") {
      return jsonResponse(personMemberships);
    }
    if (
      request.method === "POST" &&
      url.pathname === `/api/kernel/v1/organizations/${ORG.id}/memberships`
    ) {
      personMemberships = [created];
      return jsonResponse(created, 201);
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getByLabelText } = renderWithRouter(
    React.createElement(React.Fragment, null, [
      React.createElement(CreateMembershipDialog, {
        key: "create",
        organizationId: ORG.id,
      }),
      React.createElement(PersonMembershipList, {
        key: "list",
        personId: "per_1",
      }),
    ]),
  );

  await waitFor(() => assert.ok(getByText("Sin membresías")));

  fireEvent.click(getByText("Agregar socio"));
  await waitFor(() => assert.ok(getByText("Ada Lovelace")));
  fireEvent.change(getByLabelText("Persona", { exact: false }), {
    target: { value: "per_1" },
  });
  fireEvent.click(
    getByText("Crear membresía", { selector: "button[type=submit]" }),
  );

  // Waiting for a positive condition (the new row's own "Ver detalle" link),
  // not `waitFor(() => queryByText(...) === null)` — polling for an
  // *absence* through Radix's Dialog close/exit-animation cycle in jsdom
  // reliably hangs the process past `--test-force-exit`'s kill timeout, even
  // though the underlying state change itself resolves in well under 500ms
  // (confirmed by isolating the mutation from the assertion during
  // debugging). Same reasoning applies to every other `waitFor` in this
  // file: always assert something appearing, never something disappearing.
  await waitFor(() => assert.ok(getByText("Ver detalle")));

  tokenManager.clearSession();
});

/**
 * Shared shape for deactivate/graduate/reactivate: a lifecycle dialog and
 * the read-only `PersonMembershipList` mounted together under one implicit
 * QueryClient (`renderWithClient` with no explicit `queryClient` creates
 * exactly one per render, shared by every component in the tree) — proving
 * the cross-feature invalidation isn't just asserted against the
 * QueryClient directly (already covered in memberships.runtime.test.ts) but
 * actually changes what Persons renders.
 */
async function runLifecycleUpdatesPersonTab({
  DialogComponent,
  initialStatus,
  triggerLabel,
  operation,
  resultingStatus,
  resultingLabel,
  initialLabel,
}: {
  DialogComponent: (props: {
    membership: unknown;
    personLabel: string;
  }) => React.ReactElement;
  initialStatus: string;
  triggerLabel: string;
  operation: string;
  resultingStatus: string;
  resultingLabel: string;
  initialLabel: string;
}) {
  let currentMembership = membership({ status: initialStatus });
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
    if (url.pathname === "/api/kernel/v1/persons/per_1/memberships") {
      return jsonResponse([currentMembership]);
    }
    if (
      request.method === "POST" &&
      url.pathname === `/api/kernel/v1/memberships/mem_1/${operation}`
    ) {
      currentMembership = { ...currentMembership, status: resultingStatus };
      return jsonResponse(currentMembership);
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getAllByText, getByRole, queryByText } = renderWithClient(
    React.createElement(React.Fragment, null, [
      React.createElement(DialogComponent, {
        key: "dialog",
        membership: currentMembership as never,
        personLabel: "Ada Lovelace",
      }),
      React.createElement(PersonMembershipList, {
        key: "list",
        personId: "per_1",
      }),
    ]),
  );

  await waitFor(() => assert.ok(getAllByText(initialLabel).length > 0));
  fireEvent.click(getByText(triggerLabel));
  const dialog = await waitFor(() => getByRole("dialog"));
  fireEvent.click(within(dialog).getByText(triggerLabel));

  await waitFor(() => assert.ok(getAllByText(resultingLabel).length > 0));
  assert.equal(
    queryByText(initialLabel),
    null,
    "the old status badge must be gone once the refetch lands — not stacked alongside the new one",
  );

  tokenManager.clearSession();
}

test("deactivate Membership -> Person memberships updates: Membresías tab shows INACTIVA after the mutation resolves", async () => {
  await runLifecycleUpdatesPersonTab({
    DialogComponent: DeactivateMembershipDialog as never,
    initialStatus: "ACTIVE",
    triggerLabel: "Desactivar",
    operation: "deactivate",
    resultingStatus: "INACTIVE",
    initialLabel: "Activa",
    resultingLabel: "Inactiva",
  });
});

test("graduate Membership -> Person memberships updates: Membresías tab shows GRADUADA after the mutation resolves", async () => {
  await runLifecycleUpdatesPersonTab({
    DialogComponent: GraduateMembershipDialog as never,
    initialStatus: "ACTIVE",
    triggerLabel: "Graduar",
    operation: "graduate",
    resultingStatus: "GRADUATED",
    initialLabel: "Activa",
    resultingLabel: "Graduada",
  });
});

test("reactivate Membership -> Person memberships updates: Membresías tab shows ACTIVA after the mutation resolves", async () => {
  await runLifecycleUpdatesPersonTab({
    DialogComponent: ReactivateMembershipDialog as never,
    initialStatus: "INACTIVE",
    triggerLabel: "Reactivar",
    operation: "reactivate",
    resultingStatus: "ACTIVE",
    initialLabel: "Inactiva",
    resultingLabel: "Activa",
  });
});

// ---------------------------------------------------------------------------
// 9 — Membership mutation invalidates effective permissions
// ---------------------------------------------------------------------------

test("deactivate Membership invalidates effective permissions in the QueryClient shared with the rest of the Shell", async () => {
  const active = membership({ status: "ACTIVE" });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions")) {
      return permissionsResponse(["kernel.membership.deactivate"]);
    }
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
  queryClient.setQueryData(permissionsKey, ["kernel.membership.deactivate"]);

  const { getByText, getByRole } = renderWithClient(
    React.createElement(DeactivateMembershipDialog, {
      membership: active as never,
      personLabel: "Ada Lovelace",
    }),
    { queryClient },
  );

  await waitFor(() => assert.ok(getByText("Desactivar")));
  fireEvent.click(getByText("Desactivar"));
  const dialog = await waitFor(() => getByRole("dialog"));
  fireEvent.click(within(dialog).getByText("Desactivar"));

  await waitFor(() =>
    assert.equal(
      queryClient.getQueryState(permissionsKey as unknown as readonly unknown[])
        ?.isInvalidated,
      true,
    ),
  );

  tokenManager.clearSession();
});

// ---------------------------------------------------------------------------
// 10 — activeOrganization never changes from cross-scope navigation
// ---------------------------------------------------------------------------

test("activeOrganization stays put: opening a Membership scoped to a different organization never calls setActiveOrganizationId", async () => {
  const mem = membership({ organizationId: OTHER_ORG.id, status: "ACTIVE" });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname === "/api/kernel/v1/memberships/mem_1")
      return jsonResponse(mem);
    if (url.pathname === "/api/kernel/v1/memberships/mem_1/history")
      return jsonResponse([]);
    if (url.pathname === "/api/kernel/v1/persons/per_1")
      return jsonResponse(person());
    if (url.pathname === `/api/kernel/v1/organizations/${OTHER_ORG.id}`)
      return jsonResponse(OTHER_ORG);
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  let setActiveCalls = 0;
  function Probe() {
    const active = useActiveOrganizationContext();
    return React.createElement(
      "span",
      { "data-testid": "active-org" },
      active.organizationId,
    );
  }

  const { getByText, getByTestId } = renderWithClient(
    React.createElement(ActiveOrganizationProvider, {
      value: fakeActiveOrganization(ORG.id, () => {
        setActiveCalls += 1;
      }),
      children: React.createElement(React.Fragment, null, [
        React.createElement(Probe, { key: "probe" }),
        React.createElement(MembershipDetailContainer, {
          key: "detail",
          membershipId: "mem_1",
        }),
      ]),
    }),
  );

  await waitFor(() => assert.ok(getByText("Club Otro")));
  assert.equal(getByTestId("active-org").textContent, ORG.id);
  assert.equal(setActiveCalls, 0);

  tokenManager.clearSession();
});

// ---------------------------------------------------------------------------
// 11 — Person without an account still renders correctly in Membership
// ---------------------------------------------------------------------------

test("Person without primaryEmail (no account-adjacent PII) still renders correctly in Membership detail", async () => {
  const mem = membership({ status: "ACTIVE" });
  const noAccountPerson = person({
    primaryEmail: null,
    phone: null,
    birthDate: null,
  });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname === "/api/kernel/v1/memberships/mem_1")
      return jsonResponse(mem);
    if (url.pathname === "/api/kernel/v1/memberships/mem_1/history")
      return jsonResponse([]);
    if (url.pathname === "/api/kernel/v1/persons/per_1")
      return jsonResponse(noAccountPerson);
    if (url.pathname === `/api/kernel/v1/organizations/${ORG.id}`)
      return jsonResponse(ORG);
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getAllByText } = renderWithClient(
    React.createElement(MembershipDetailContainer, { membershipId: "mem_1" }),
  );

  await waitFor(() => assert.ok(getAllByText("Ada Lovelace").length > 0));

  tokenManager.clearSession();
});

// ---------------------------------------------------------------------------
// 12 — A 403 on Membresías doesn't turn the whole Person page into a 403
// ---------------------------------------------------------------------------

test("403 on listPersonMemberships stays scoped to the Membresías tab — Identity keeps rendering", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname === "/api/kernel/v1/persons/per_1")
      return jsonResponse(person());
    if (url.pathname === "/api/kernel/v1/persons/per_1/memberships") {
      return problemResponse(403, "KERNEL_FORBIDDEN");
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getAllByText } = renderWithClient(
    React.createElement(PersonDetailContainer, { personId: "per_1" }),
  );

  await waitFor(() => assert.ok(getAllByText("Ada Lovelace").length > 0));
  fireEvent.mouseDown(getByText("Membresías"));

  await waitFor(() =>
    assert.ok(
      getByText(
        "No tenés permisos para ver esta información en esta organización.",
      ),
    ),
  );
  // The page header (Identity) is untouched by the tab's own 403.
  assert.ok(getAllByText("Ada Lovelace").length > 0);

  tokenManager.clearSession();
});

// ---------------------------------------------------------------------------
// 13 — A 404 on one row's Person doesn't break the Membership list
// ---------------------------------------------------------------------------

test("404 on a row's Person doesn't break the Membership list — that row falls back to '—', the rest renders", async () => {
  const memMissingPerson = membership({
    id: "mem_ghost",
    personId: "per_missing",
  });
  const memOk = membership({
    id: "mem_ok",
    personId: "per_1",
    status: "ACTIVE",
  });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname === "/api/kernel/v1/persons/per_missing") {
      return problemResponse(404, "KERNEL_NOT_FOUND");
    }
    if (url.pathname === "/api/kernel/v1/persons/per_1")
      return jsonResponse(person());
    if (url.pathname === `/api/kernel/v1/organizations/${ORG.id}/memberships`) {
      return jsonResponse({
        items: [memMissingPerson, memOk],
        pageInfo: { hasMore: false },
      });
    }
    if (url.pathname.endsWith("/organizations")) {
      return jsonResponse({ items: [ORG], pageInfo: { hasMore: false } });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getAllByText } = renderWithRouter(
    React.createElement(ActiveOrganizationProvider, {
      value: fakeActiveOrganization(ORG.id),
      children: React.createElement(MembershipsListContainer),
    }),
  );

  await waitFor(() => assert.ok(getByText("Ada Lovelace")));
  assert.ok(
    getAllByText("—").length > 0,
    "the row whose person 404s falls back to '—', not a crash",
  );

  tokenManager.clearSession();
});

// ---------------------------------------------------------------------------
// 14 — Filters survive returning to a URL carrying them
// ---------------------------------------------------------------------------

test("filters survive navigation: /persons?query= pre-fills the search input, /memberships?organization=&status= pre-fills both selects", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname === "/api/kernel/v1/persons") {
      return jsonResponse({ items: [], pageInfo: { hasMore: false } });
    }
    if (url.pathname.endsWith("/organizations")) {
      return jsonResponse({ items: [ORG], pageInfo: { hasMore: false } });
    }
    if (url.pathname === `/api/kernel/v1/organizations/${ORG.id}/memberships`) {
      return jsonResponse({ items: [], pageInfo: { hasMore: false } });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const persons = renderWithRouter(React.createElement(PersonsListContainer), {
    initialSearchParams: new URLSearchParams("query=facundo"),
    pathname: "/persons",
  });
  await waitFor(() =>
    assert.equal(
      (persons.getByLabelText("Buscar personas") as HTMLInputElement).value,
      "facundo",
    ),
  );
  persons.unmount();

  const memberships = renderWithRouter(
    React.createElement(ActiveOrganizationProvider, {
      value: fakeActiveOrganization(ORG.id),
      children: React.createElement(MembershipsListContainer),
    }),
    {
      initialSearchParams: new URLSearchParams(
        `organization=${ORG.id}&status=ACTIVE`,
      ),
      pathname: "/memberships",
    },
  );
  await waitFor(() =>
    assert.equal(
      (memberships.getByLabelText("Filtrar por estado") as HTMLSelectElement)
        .value,
      "ACTIVE",
    ),
  );
  // The organization <select>'s options come from a separate bounded
  // `useOrganizations` request (`useOrganizationCandidates`) — its value
  // only reflects "org_1" once that request resolves and the matching
  // <option> actually exists in the DOM, so this needs its own wait.
  await waitFor(() =>
    assert.equal(
      (
        memberships.getByLabelText(
          "Filtrar por organización",
        ) as HTMLSelectElement
      ).value,
      ORG.id,
    ),
  );

  tokenManager.clearSession();
});

// ---------------------------------------------------------------------------
// 15 — Integrating the two features doesn't introduce a new N+1
// ---------------------------------------------------------------------------

test("anti-N+1 across features: a Membership row and a Person's Membresías tab sharing a personId dedupe into one /persons request via the shared QueryClient", async () => {
  const memRow = {
    id: "mem_shared",
    personId: "per_shared",
    status: "ACTIVE" as const,
    memberNumber: null,
    joinedAt: "2025-02-01T00:00:00.000Z",
    endedAt: null,
    href: "/memberships/mem_shared",
  };
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname === "/api/kernel/v1/persons/per_shared") {
      return jsonResponse(
        person({ id: "per_shared", displayName: "Persona Compartida" }),
      );
    }
    if (url.pathname === "/api/kernel/v1/persons/per_shared/memberships") {
      return jsonResponse([
        membership({ id: "mem_shared", personId: "per_shared" }),
      ]);
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getAllByText } = renderWithClient(
    React.createElement(React.Fragment, null, [
      React.createElement(MembershipsTable, { key: "table", items: [memRow] }),
      React.createElement(PersonMembershipList, {
        key: "list",
        personId: "per_shared",
      }),
    ]),
  );

  await waitFor(() => assert.ok(getAllByText("Persona Compartida").length > 0));

  const personCalls = backend.kernelCalls.filter(
    (c) => c.url === "https://kernel.test/api/kernel/v1/persons/per_shared",
  );
  assert.equal(
    personCalls.length,
    1,
    "the Membership row and the Person tab share one TanStack Query cache — integrating the two features must not double the request",
  );

  tokenManager.clearSession();
});
