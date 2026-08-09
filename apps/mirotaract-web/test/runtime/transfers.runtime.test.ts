// bootstrap.ts installs jsdom's globals and must run before
// `@testing-library/react`/react-dom ever get imported — see the same note
// in memberships.runtime.test.ts.
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
const { appointmentKeys } =
  await import("../../src/lib/api/appointments/appointments.keys.ts");
const { useCompleteMembershipTransfer } =
  await import("../../src/lib/api/transfers/transfers.hooks.ts");
const { TransfersListContainer } =
  await import("../../src/features/transfers/containers/transfers-list-container.tsx");
const { TransferDetailContainer } =
  await import("../../src/features/transfers/containers/transfer-detail-container.tsx");
const { TransferActionsRow } =
  await import("../../src/features/transfers/components/transfer-actions-row.tsx");
const { RequestTransferDialog } =
  await import("../../src/features/transfers/forms/request-transfer-dialog.tsx");
const { AcceptTransferDialog } =
  await import("../../src/features/transfers/forms/accept-transfer-dialog.tsx");
const { ConfirmTransferDialog } =
  await import("../../src/features/transfers/forms/confirm-transfer-dialog.tsx");
const { CompleteTransferDialog } =
  await import("../../src/features/transfers/forms/complete-transfer-dialog.tsx");
const { RejectTransferDialog } =
  await import("../../src/features/transfers/forms/reject-transfer-dialog.tsx");
const { CancelTransferDialog } =
  await import("../../src/features/transfers/forms/cancel-transfer-dialog.tsx");

const ORG_FROM = {
  id: "org_from",
  parentId: null,
  type: "CLUB",
  code: "RTC-FROM",
  name: "Club Origen",
  slug: "club-origen",
  status: "ACTIVE",
  timezone: "America/Argentina/Cordoba",
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
};

const ORG_TO = {
  id: "org_to",
  parentId: null,
  type: "CLUB",
  code: "RTC-TO",
  name: "Club Destino",
  slug: "club-destino",
  status: "ACTIVE",
  timezone: "America/Argentina/Cordoba",
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
};

function meResponse(overrides: Record<string, unknown> = {}) {
  return jsonResponse({
    accountId: "acc_1",
    personId: "per_1",
    accountStatus: "ACTIVE",
    platformRole: "USER",
    displayName: "Ana",
    memberships: [],
    contextVersion: 1,
    ...overrides,
  });
}

function permissionsResponse(perms: string[]) {
  return jsonResponse(perms);
}

function membership(overrides: Record<string, unknown> = {}) {
  return {
    id: "mem_1",
    organizationId: ORG_FROM.id,
    personId: "per_1",
    memberNumber: null,
    status: "ACTIVE",
    joinedAt: "2025-01-01T00:00:00.000Z",
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

function transfer(overrides: Record<string, unknown> = {}) {
  return {
    id: "trf_1",
    membershipId: "mem_1",
    fromOrganizationId: ORG_FROM.id,
    toOrganizationId: ORG_TO.id,
    requestedById: "per_1",
    status: "REQUESTED",
    reason: null,
    requestedAt: "2025-03-01T00:00:00.000Z",
    createdAt: "2025-03-01T00:00:00.000Z",
    updatedAt: "2025-03-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Shared handler wiring for `/auth/me`, orgs, memberships, persons — every test overrides transfer-specific endpoints on top. */
function baseHandler({
  permissions = [] as string[] | ((organizationId: string | null) => string[]),
  me = meResponse(),
}: {
  permissions?: string[] | ((organizationId: string | null) => string[]);
  me?: Response;
} = {}) {
  return (request: Request): Response | Promise<Response> => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return me;
    if (url.pathname.includes("/effective-permissions")) {
      const organizationId = url.searchParams.get("organizationId");
      const perms =
        typeof permissions === "function"
          ? permissions(organizationId)
          : permissions;
      return permissionsResponse(perms);
    }
    if (url.pathname === "/api/kernel/v1/persons/per_1")
      return jsonResponse(person());
    if (url.pathname === `/api/kernel/v1/organizations/${ORG_FROM.id}`)
      return jsonResponse(ORG_FROM);
    if (url.pathname === `/api/kernel/v1/organizations/${ORG_TO.id}`)
      return jsonResponse(ORG_TO);
    if (url.pathname === "/api/kernel/v1/memberships/mem_1")
      return jsonResponse(membership());
    return problemResponse(404, "NOT_FOUND");
  };
}

// ---------------------------------------------------------------------------
// US-TRA-01 — Listing
// ---------------------------------------------------------------------------

test("Transfers list — loading then success: renders a row with person and both organizations resolved", async () => {
  const trf = transfer();
  const backend = new MockBackend();
  const base = baseHandler();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname === "/api/kernel/v1/membership-transfers") {
      return jsonResponse([trf]);
    }
    if (url.pathname.endsWith("/organizations")) {
      return jsonResponse({
        items: [ORG_FROM, ORG_TO],
        pageInfo: { hasMore: false },
      });
    }
    return base(request);
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getAllByText } = renderWithRouter(
    React.createElement(TransfersListContainer),
  );

  await waitFor(() => assert.ok(getByText("Ada Lovelace")));
  // Both organization names also appear as `<option>`s in the from/to
  // filter selects — assert presence via getAllByText, not a single match.
  assert.ok(getAllByText("Club Origen").length > 0);
  assert.ok(getAllByText("Club Destino").length > 0);
  assert.ok(getAllByText("Solicitada").length > 0);

  tokenManager.clearSession();
});

test("Transfers list — empty: renders a DataState, not a blank table", async () => {
  const backend = new MockBackend();
  const base = baseHandler();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname === "/api/kernel/v1/membership-transfers") {
      return jsonResponse([]);
    }
    if (url.pathname.endsWith("/organizations")) {
      return jsonResponse({ items: [], pageInfo: { hasMore: false } });
    }
    return base(request);
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText } = renderWithRouter(
    React.createElement(TransfersListContainer),
  );

  await waitFor(() => assert.ok(getByText("Sin transferencias")));

  tokenManager.clearSession();
});

test('Transfers list — forbidden: a 403 shows the institutional message, never "Error 403"', async () => {
  const backend = new MockBackend();
  const base = baseHandler();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname === "/api/kernel/v1/membership-transfers") {
      return problemResponse(403, "KERNEL_FORBIDDEN");
    }
    if (url.pathname.endsWith("/organizations")) {
      return jsonResponse({ items: [], pageInfo: { hasMore: false } });
    }
    return base(request);
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, queryByText } = renderWithRouter(
    React.createElement(TransfersListContainer),
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

test("Transfers list — status filter changes the request, and an explicit ?status= from the URL is honored", async () => {
  const requested = transfer({ id: "trf_req", status: "REQUESTED" });
  const completed = transfer({
    id: "trf_done",
    status: "COMPLETED",
    completedAt: "2025-04-01T00:00:00.000Z",
  });
  const backend = new MockBackend();
  const base = baseHandler();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname === "/api/kernel/v1/membership-transfers") {
      const status = url.searchParams.get("status");
      if (status === "COMPLETED") return jsonResponse([completed]);
      return jsonResponse([requested]);
    }
    if (url.pathname.endsWith("/organizations")) {
      return jsonResponse({
        items: [ORG_FROM, ORG_TO],
        pageInfo: { hasMore: false },
      });
    }
    return base(request);
  };
  tokenManager.setSession(backend.issueToken(), 600);

  // Explicit ?status=COMPLETED in the URL is honored on first render.
  const { getByLabelText } = renderWithRouter(
    React.createElement(TransfersListContainer),
    {
      initialSearchParams: new URLSearchParams("status=COMPLETED"),
      pathname: "/transfers",
    },
  );

  await waitFor(() =>
    assert.ok(
      backend.kernelCalls.some(
        (c) =>
          c.url.includes("/membership-transfers?") &&
          c.url.includes("status=COMPLETED"),
      ),
    ),
  );

  const before = backend.kernelCalls.filter((c) =>
    c.url.includes("/membership-transfers"),
  ).length;
  fireEvent.change(getByLabelText("Filtrar por estado"), {
    target: { value: "REQUESTED" },
  });

  await waitFor(() => {
    const filtered = backend.kernelCalls.filter(
      (c) =>
        c.url.includes("/membership-transfers?") &&
        c.url.includes("status=REQUESTED"),
    );
    assert.ok(filtered.length > 0, "expected a request with status=REQUESTED");
  });
  assert.ok(
    backend.kernelCalls.filter((c) => c.url.includes("/membership-transfers"))
      .length > before,
  );

  tokenManager.clearSession();
});

// ---------------------------------------------------------------------------
// US-TRA-02 — Detail + workflow timeline
// ---------------------------------------------------------------------------

test("Transfer detail — success: renders summary and the workflow timeline in order", async () => {
  const trf = transfer({
    status: "CONFIRMED_BY_ORIGIN",
    acceptedAt: "2025-03-02T00:00:00.000Z",
    acceptedById: "per_1",
    confirmedAt: "2025-03-03T00:00:00.000Z",
    confirmedById: "per_1",
  });
  const backend = new MockBackend();
  const base = baseHandler();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname === "/api/kernel/v1/membership-transfers/trf_1") {
      return jsonResponse(trf);
    }
    return base(request);
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getAllByText } = renderWithClient(
    React.createElement(TransferDetailContainer, { transferId: "trf_1" }),
  );

  await waitFor(() => assert.ok(getAllByText("Ada Lovelace").length > 0));
  assert.ok(getByText("Club Origen"));
  assert.ok(getByText("Club Destino"));
  // Step headings (action phrases) are distinct from the status badges
  // next to them (see transfer-workflow-timeline.tsx) — each renders once.
  assert.ok(getByText("Transferencia solicitada"));
  assert.ok(getByText("El destino aceptó la transferencia"));
  assert.ok(getByText("El origen confirmó la transferencia"));
  // "Confirmada por origen" (the status label) appears twice on this page
  // (the summary card's current-status badge AND the timeline's last
  // step's badge) — assert presence, not a single match.
  assert.ok(getAllByText("Confirmada por origen").length > 0);

  const html = document.body.innerHTML;
  assert.ok(
    html.indexOf("Transferencia solicitada") <
      html.indexOf("El destino aceptó la transferencia") &&
      html.indexOf("El destino aceptó la transferencia") <
        html.indexOf("El origen confirmó la transferencia"),
    "timeline must render in ascending timestamp order",
  );

  tokenManager.clearSession();
});

test("Transfer detail — not found: a 404 renders 'no encontrada', not a generic error", async () => {
  const backend = new MockBackend();
  const base = baseHandler();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname === "/api/kernel/v1/membership-transfers/trf_missing") {
      return problemResponse(404, "KERNEL_NOT_FOUND");
    }
    return base(request);
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText } = renderWithClient(
    React.createElement(TransferDetailContainer, {
      transferId: "trf_missing",
    }),
  );

  await waitFor(() => assert.ok(getByText("Transferencia no encontrada")));

  tokenManager.clearSession();
});

test("Transfer detail — forbidden: a 403 shows the institutional message", async () => {
  const backend = new MockBackend();
  const base = baseHandler();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname === "/api/kernel/v1/membership-transfers/trf_secret") {
      return problemResponse(403, "KERNEL_FORBIDDEN");
    }
    return base(request);
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText } = renderWithClient(
    React.createElement(TransferDetailContainer, { transferId: "trf_secret" }),
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
// US-TRA-03 — Request
// ---------------------------------------------------------------------------

test("Request transfer — success: submits RequestMembershipTransferRequest exactly and navigates to the new detail page", async () => {
  const created = transfer({ id: "trf_new" });
  const backend = new MockBackend();
  let requestBody: unknown;
  const base = baseHandler({
    permissions: ["kernel.transfer.create.self"],
    me: meResponse({
      memberships: [
        {
          membershipId: "mem_1",
          organizationId: ORG_FROM.id,
          organizationType: "CLUB",
          status: "ACTIVE",
        },
      ],
    }),
  });
  backend.kernelHandler = async (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/organizations")) {
      return jsonResponse({
        items: [ORG_FROM, ORG_TO],
        pageInfo: { hasMore: false },
      });
    }
    if (
      request.method === "POST" &&
      url.pathname === "/api/kernel/v1/membership-transfers"
    ) {
      requestBody = await request.json();
      return jsonResponse(created, 201);
    }
    return base(request);
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getByLabelText, router } = renderWithRouter(
    React.createElement(RequestTransferDialog),
  );

  fireEvent.click(getByText("Solicitar transferencia"));
  await waitFor(() => assert.ok(getByText("Club Origen")));

  fireEvent.change(getByLabelText("Tu membresía", { exact: false }), {
    target: { value: "mem_1" },
  });
  await waitFor(() => assert.ok(getByText("Club Destino")));
  fireEvent.change(getByLabelText("Organización destino", { exact: false }), {
    target: { value: ORG_TO.id },
  });

  fireEvent.click(getByText("Solicitar", { selector: "button[type=submit]" }));

  await waitFor(() => {
    assert.deepEqual(requestBody, {
      membershipId: "mem_1",
      toOrganizationId: ORG_TO.id,
    });
  });
  await waitFor(() =>
    assert.ok(router.pushCalls.includes("/transfers/trf_new")),
  );

  tokenManager.clearSession();
});

test("Request transfer — 409 duplicate open transfer: shows the institutional conflict message and keeps the dialog open", async () => {
  const backend = new MockBackend();
  const base = baseHandler({
    permissions: ["kernel.transfer.create.self"],
    me: meResponse({
      memberships: [
        {
          membershipId: "mem_1",
          organizationId: ORG_FROM.id,
          organizationType: "CLUB",
          status: "ACTIVE",
        },
      ],
    }),
  });
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/organizations")) {
      return jsonResponse({
        items: [ORG_FROM, ORG_TO],
        pageInfo: { hasMore: false },
      });
    }
    if (
      request.method === "POST" &&
      url.pathname === "/api/kernel/v1/membership-transfers"
    ) {
      return problemResponse(409, "KERNEL_CONFLICT", {
        detail: "an open transfer already exists for this membership",
      });
    }
    return base(request);
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getByLabelText } = renderWithRouter(
    React.createElement(RequestTransferDialog),
  );

  fireEvent.click(getByText("Solicitar transferencia"));
  await waitFor(() => assert.ok(getByText("Club Origen")));
  fireEvent.change(getByLabelText("Tu membresía", { exact: false }), {
    target: { value: "mem_1" },
  });
  await waitFor(() => assert.ok(getByText("Club Destino")));
  fireEvent.change(getByLabelText("Organización destino", { exact: false }), {
    target: { value: ORG_TO.id },
  });
  fireEvent.click(getByText("Solicitar", { selector: "button[type=submit]" }));

  await waitFor(() =>
    assert.ok(
      getByText("Ya existe una transferencia abierta para esta membresía."),
    ),
  );
  assert.ok(
    getByLabelText("Tu membresía", { exact: false }),
    "the dialog stays open on error, the form isn't lost",
  );

  tokenManager.clearSession();
});

// ---------------------------------------------------------------------------
// US-TRA-04 — Accept (destination scope)
// ---------------------------------------------------------------------------

test("Accept transfer — REQUESTED -> ACCEPTED_BY_DESTINATION when granted at the destination organization's scope", async () => {
  const trf = transfer({ status: "REQUESTED" });
  const backend = new MockBackend();
  let acceptCalled = false;
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions")) {
      const organizationId = url.searchParams.get("organizationId");
      return permissionsResponse(
        organizationId === ORG_TO.id ? ["kernel.transfer.accept"] : [],
      );
    }
    if (
      request.method === "POST" &&
      url.pathname === "/api/kernel/v1/membership-transfers/trf_1/accept"
    ) {
      acceptCalled = true;
      return jsonResponse({ ...trf, status: "ACCEPTED_BY_DESTINATION" });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getByRole } = renderWithClient(
    React.createElement(AcceptTransferDialog, { transfer: trf as never }),
  );

  await waitFor(() => assert.ok(getByText("Aceptar")));
  fireEvent.click(getByText("Aceptar"));
  const dialog = await waitFor(() => getByRole("dialog"));
  assert.equal(acceptCalled, false, "no request until confirm is clicked");
  fireEvent.click(within(dialog).getByText("Aceptar"));

  await waitFor(() => assert.equal(acceptCalled, true));

  tokenManager.clearSession();
});

test("Accept transfer — granting the permission at the ORIGIN organization's scope does not enable the button (must be destination scope)", async () => {
  const trf = transfer({ status: "REQUESTED" });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions")) {
      const organizationId = url.searchParams.get("organizationId");
      // Granted at the WRONG (origin) scope on purpose.
      return permissionsResponse(
        organizationId === ORG_FROM.id ? ["kernel.transfer.accept"] : [],
      );
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { queryByText } = renderWithClient(
    React.createElement(AcceptTransferDialog, { transfer: trf as never }),
  );

  // Give effective-permissions a tick to resolve so this asserts a real gate failure, not just default-hidden.
  await waitFor(() => assert.ok(document.body));
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(queryByText("Aceptar"), null);

  tokenManager.clearSession();
});

// ---------------------------------------------------------------------------
// US-TRA-05 — Confirm (origin scope)
// ---------------------------------------------------------------------------

test("Confirm transfer — ACCEPTED_BY_DESTINATION -> CONFIRMED_BY_ORIGIN when granted at the origin organization's scope", async () => {
  const trf = transfer({ status: "ACCEPTED_BY_DESTINATION" });
  const backend = new MockBackend();
  let confirmCalled = false;
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions")) {
      const organizationId = url.searchParams.get("organizationId");
      return permissionsResponse(
        organizationId === ORG_FROM.id ? ["kernel.transfer.confirm"] : [],
      );
    }
    if (
      request.method === "POST" &&
      url.pathname === "/api/kernel/v1/membership-transfers/trf_1/confirm"
    ) {
      confirmCalled = true;
      return jsonResponse({ ...trf, status: "CONFIRMED_BY_ORIGIN" });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getByRole } = renderWithClient(
    React.createElement(ConfirmTransferDialog, { transfer: trf as never }),
  );

  await waitFor(() => assert.ok(getByText("Confirmar")));
  fireEvent.click(getByText("Confirmar"));
  const dialog = await waitFor(() => getByRole("dialog"));
  fireEvent.click(within(dialog).getByText("Confirmar"));

  await waitFor(() => assert.equal(confirmCalled, true));

  tokenManager.clearSession();
});

test("Confirm transfer — granting the permission at the DESTINATION organization's scope does not enable the button (must be origin scope)", async () => {
  const trf = transfer({ status: "ACCEPTED_BY_DESTINATION" });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions")) {
      const organizationId = url.searchParams.get("organizationId");
      return permissionsResponse(
        organizationId === ORG_TO.id ? ["kernel.transfer.confirm"] : [],
      );
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { queryByText } = renderWithClient(
    React.createElement(ConfirmTransferDialog, { transfer: trf as never }),
  );

  await waitFor(() => assert.ok(document.body));
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(queryByText("Confirmar"), null);

  tokenManager.clearSession();
});

// ---------------------------------------------------------------------------
// US-TRA-06 — Complete
// ---------------------------------------------------------------------------

test("Complete transfer — CONFIRMED_BY_ORIGIN -> COMPLETED, and the ONLY mutation issued is POST .../complete (never a manual membership/appointment mutation)", async () => {
  const trf = transfer({ status: "CONFIRMED_BY_ORIGIN" });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions")) {
      const organizationId = url.searchParams.get("organizationId");
      return permissionsResponse(
        organizationId === ORG_FROM.id ? ["kernel.transfer.confirm"] : [],
      );
    }
    if (
      request.method === "POST" &&
      url.pathname === "/api/kernel/v1/membership-transfers/trf_1/complete"
    ) {
      return jsonResponse({ ...trf, status: "COMPLETED" });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getByRole } = renderWithClient(
    React.createElement(CompleteTransferDialog, { transfer: trf as never }),
  );

  await waitFor(() => assert.ok(getByText("Completar")));
  fireEvent.click(getByText("Completar"));
  const dialog = await waitFor(() => getByRole("dialog"));
  fireEvent.click(within(dialog).getByText("Completar"));

  await waitFor(() =>
    assert.ok(
      backend.kernelCalls.some(
        (c) =>
          c.method === "POST" &&
          c.url.endsWith("/membership-transfers/trf_1/complete"),
      ),
    ),
  );

  const mutationCalls = backend.kernelCalls.filter((c) => c.method !== "GET");
  assert.ok(
    mutationCalls.every((c) => c.url.includes("/membership-transfers/")),
    "the only mutation this dialog issues is against the transfer resource itself",
  );
  assert.ok(
    !mutationCalls.some((c) => c.url.includes("/memberships/")),
    "must never manually mutate a Membership from this flow",
  );
  assert.ok(
    !mutationCalls.some((c) => c.url.includes("/appointments/")),
    "must never manually mutate an Appointment from this flow",
  );

  tokenManager.clearSession();
});

test("Complete transfer — cache invalidation: also invalidates current-authorities for the origin organization (invariant 6.9.5 fix)", async () => {
  const trf = transfer({ status: "CONFIRMED_BY_ORIGIN" });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (
      request.method === "POST" &&
      url.pathname === "/api/kernel/v1/membership-transfers/trf_1/complete"
    ) {
      return jsonResponse({ ...trf, status: "COMPLETED" });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const queryClient = newQueryClient();
  const authoritiesKey = appointmentKeys.currentAuthorities(ORG_FROM.id);
  const appointmentListsKey = appointmentKeys.lists();
  queryClient.setQueryData(authoritiesKey, "seed");
  queryClient.setQueryData(appointmentListsKey, "seed");

  const { result } = renderHookWithClient(
    () => useCompleteMembershipTransfer(),
    {
      queryClient,
    },
  );
  result.current.mutate("trf_1");

  await waitFor(() => assert.equal(result.current.isSuccess, true));

  assert.equal(
    queryClient.getQueryState(authoritiesKey as unknown as readonly unknown[])
      ?.isInvalidated,
    true,
    "completing a transfer must invalidate current-authorities for the origin organization",
  );
  assert.equal(
    queryClient.getQueryState(
      appointmentListsKey as unknown as readonly unknown[],
    )?.isInvalidated,
    true,
    "completing a transfer must invalidate appointment lists too",
  );

  tokenManager.clearSession();
});

// ---------------------------------------------------------------------------
// US-TRA-07 — Reject
// ---------------------------------------------------------------------------

test("Reject transfer — an empty motivo blocks submit (no request issued); a real motivo sends { rejectionReason }", async () => {
  const trf = transfer({ status: "REQUESTED" });
  const backend = new MockBackend();
  let rejectBody: unknown;
  let rejectCalls = 0;
  backend.kernelHandler = async (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions")) {
      const organizationId = url.searchParams.get("organizationId");
      return permissionsResponse(
        organizationId === ORG_FROM.id ? ["kernel.transfer.reject"] : [],
      );
    }
    if (
      request.method === "POST" &&
      url.pathname === "/api/kernel/v1/membership-transfers/trf_1/reject"
    ) {
      rejectCalls += 1;
      rejectBody = await request.json();
      return jsonResponse({
        ...trf,
        status: "REJECTED",
        rejectionReason: (rejectBody as { rejectionReason: string })
          .rejectionReason,
      });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getByRole, getByLabelText } = renderWithClient(
    React.createElement(RejectTransferDialog, { transfer: trf as never }),
  );

  await waitFor(() => assert.ok(getByText("Rechazar")));
  fireEvent.click(getByText("Rechazar"));
  const dialog = await waitFor(() => getByRole("dialog"));

  // Empty motivo: clicking confirm must not issue a request.
  fireEvent.click(within(dialog).getByText("Rechazar"));
  await waitFor(() =>
    assert.ok(within(dialog).getByText("El motivo es obligatorio.")),
  );
  assert.equal(rejectCalls, 0);

  fireEvent.change(getByLabelText("Motivo", { exact: false }), {
    target: { value: "No cumple los requisitos" },
  });
  fireEvent.click(within(dialog).getByText("Rechazar"));

  await waitFor(() =>
    assert.deepEqual(rejectBody, {
      rejectionReason: "No cumple los requisitos",
    }),
  );
  assert.equal(rejectCalls, 1);

  tokenManager.clearSession();
});

// ---------------------------------------------------------------------------
// US-TRA-08 — Cancel
// ---------------------------------------------------------------------------

test("Cancel transfer — the requester cancels their own REQUESTED transfer", async () => {
  const trf = transfer({ status: "REQUESTED", requestedById: "per_1" });
  const backend = new MockBackend();
  let cancelCalled = false;
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse(["kernel.transfer.create.self"]);
    if (
      request.method === "POST" &&
      url.pathname === "/api/kernel/v1/membership-transfers/trf_1/cancel"
    ) {
      cancelCalled = true;
      return jsonResponse({ ...trf, status: "CANCELLED" });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getByRole } = renderWithClient(
    React.createElement(CancelTransferDialog, { transfer: trf as never }),
  );

  await waitFor(() => assert.ok(getByText("Cancelar transferencia")));
  fireEvent.click(getByText("Cancelar transferencia"));
  const dialog = await waitFor(() => getByRole("dialog"));
  fireEvent.click(within(dialog).getByText("Cancelar transferencia"));

  await waitFor(() => assert.equal(cancelCalled, true));

  tokenManager.clearSession();
});

test("Cancel transfer — someone else's transfer never offers the button, even with the permission granted", async () => {
  const trf = transfer({ status: "REQUESTED", requestedById: "per_other" });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse(["kernel.transfer.create.self"]);
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { queryByText } = renderWithClient(
    React.createElement(CancelTransferDialog, { transfer: trf as never }),
  );

  await waitFor(() => assert.ok(document.body));
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(queryByText("Cancelar transferencia"), null);

  tokenManager.clearSession();
});

// ---------------------------------------------------------------------------
// EXPIRED — no manual transition
// ---------------------------------------------------------------------------

test('EXPIRED transfer — no "Expirar" button is ever offered, and none of the five transition dialogs render either', async () => {
  const trf = transfer({ status: "EXPIRED" });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions")) {
      // Every relevant permission granted at every scope — if a button is
      // still hidden, it's the status gate, not the permission gate.
      return permissionsResponse([
        "kernel.transfer.accept",
        "kernel.transfer.confirm",
        "kernel.transfer.reject",
        "kernel.transfer.create.self",
      ]);
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { queryByText } = renderWithClient(
    React.createElement(TransferActionsRow, { transfer: trf as never }),
  );

  await waitFor(() => assert.ok(document.body));
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(queryByText("Expirar"), null);
  assert.equal(queryByText("Aceptar"), null);
  assert.equal(queryByText("Confirmar"), null);
  assert.equal(queryByText("Completar"), null);
  assert.equal(queryByText("Rechazar"), null);
  assert.equal(queryByText("Cancelar transferencia"), null);

  tokenManager.clearSession();
});
