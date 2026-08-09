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
const { ApplicationsListContainer } =
  await import("../../src/features/applications/containers/applications-list-container.tsx");
const { ApplicationDetailContainer } =
  await import("../../src/features/applications/containers/application-detail-container.tsx");
const { CreateApplicationDialog } =
  await import("../../src/features/applications/forms/create-application-dialog.tsx");
const { SubmitApplicationDialog } =
  await import("../../src/features/applications/forms/submit-application-dialog.tsx");
const { ApproveApplicationDialog } =
  await import("../../src/features/applications/forms/approve-application-dialog.tsx");
const { RejectApplicationDialog } =
  await import("../../src/features/applications/forms/reject-application-dialog.tsx");
const { CancelApplicationDialog } =
  await import("../../src/features/applications/forms/cancel-application-dialog.tsx");
const { ApplicationActionsRow } =
  await import("../../src/features/applications/components/application-actions-row.tsx");

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

function application(overrides: Record<string, unknown> = {}) {
  return {
    id: "app_1",
    organizationId: ORG.id,
    requesterPersonId: "per_1",
    membershipId: null,
    status: "DRAFT",
    message: null,
    submittedAt: null,
    reviewedById: null,
    reviewedAt: null,
    rejectionReason: null,
    expiresAt: null,
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

/** Fake `useActiveOrganization()` return shape — real shell context, faked value. */
function fakeActiveOrganization(organizationId: string | undefined) {
  return {
    organizationId,
    organization: organizationId ? (ORG as never) : undefined,
    isLoading: false,
    availableMemberships: [],
    setActiveOrganizationId: () => {},
  };
}

function renderApplicationsList(
  activeOrganizationId: string | undefined,
  options: Parameters<typeof renderWithRouter>[1] = {},
) {
  return renderWithRouter(
    React.createElement(ActiveOrganizationProvider, {
      value: fakeActiveOrganization(activeOrganizationId),
      children: React.createElement(ApplicationsListContainer),
    }),
    options,
  );
}

// ---------------------------------------------------------------------------
// US-SOL-01 — Listing
// ---------------------------------------------------------------------------

test("Applications list — loading then success: renders a row with the applicant resolved through the bounded join", async () => {
  const app = application({
    status: "SUBMITTED",
    submittedAt: "2025-02-01T00:00:00.000Z",
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
    if (url.pathname === "/api/kernel/v1/membership-applications") {
      return jsonResponse([app]);
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getAllByText } = renderApplicationsList(ORG.id);

  await waitFor(() => assert.ok(getByText("Ada Lovelace")));
  // "Enviada" also appears as a filter <option> — only assert the status badge exists.
  assert.ok(getAllByText("Enviada").length > 0);

  tokenManager.clearSession();
});

test("Applications list — empty: renders a DataState, not a blank table", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname.endsWith("/organizations")) {
      return jsonResponse({ items: [ORG], pageInfo: { hasMore: false } });
    }
    if (url.pathname === "/api/kernel/v1/membership-applications") {
      return jsonResponse([]);
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText } = renderApplicationsList(ORG.id);

  await waitFor(() => assert.ok(getByText("Sin solicitudes")));

  tokenManager.clearSession();
});

test('Applications list — forbidden: a 403 shows the institutional message, never "Error 403"', async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname.endsWith("/organizations")) {
      return jsonResponse({ items: [ORG], pageInfo: { hasMore: false } });
    }
    if (url.pathname === "/api/kernel/v1/membership-applications") {
      return problemResponse(403, "KERNEL_FORBIDDEN");
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, queryByText } = renderApplicationsList(ORG.id);

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

test("Applications list — status filter changes the request", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname.endsWith("/organizations")) {
      return jsonResponse({ items: [ORG], pageInfo: { hasMore: false } });
    }
    if (url.pathname === "/api/kernel/v1/membership-applications") {
      return jsonResponse([]);
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByLabelText } = renderApplicationsList(ORG.id);

  await waitFor(() =>
    assert.ok(
      backend.kernelCalls.some((c) =>
        c.url.includes("/membership-applications"),
      ),
    ),
  );

  fireEvent.change(getByLabelText("Filtrar por estado"), {
    target: { value: "SUBMITTED" },
  });

  await waitFor(() => {
    const filtered = backend.kernelCalls.filter(
      (c) =>
        c.url.includes("/membership-applications?") &&
        c.url.includes("status=SUBMITTED"),
    );
    assert.ok(
      filtered.length > 0,
      "expected a request with status=SUBMITTED after the filter changed",
    );
  });

  tokenManager.clearSession();
});

test("Applications list — an explicit ?organization= wins over activeOrganizationId", async () => {
  const otherOrgApp = application({
    id: "app_other",
    organizationId: "org_2",
    status: "SUBMITTED",
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
    if (url.pathname === "/api/kernel/v1/membership-applications") {
      if (url.searchParams.get("organizationId") === "org_2") {
        return jsonResponse([otherOrgApp]);
      }
      return jsonResponse([]);
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  // Active organization resolves to ORG.id, but the URL explicitly says org_2.
  const { getByText } = renderApplicationsList(ORG.id, {
    initialSearchParams: new URLSearchParams("organization=org_2"),
    pathname: "/applications",
  });

  await waitFor(() =>
    assert.ok(
      backend.kernelCalls.some(
        (c) =>
          c.url.includes("/membership-applications") &&
          c.url.includes("organizationId=org_2"),
      ),
    ),
  );
  assert.ok(
    !backend.kernelCalls.some(
      (c) =>
        c.url.includes("/membership-applications") &&
        c.url.includes(`organizationId=${ORG.id}`),
    ),
    "the explicit ?organization= param must win over activeOrganizationId",
  );
  await waitFor(() => assert.ok(getByText("Ada Lovelace")));

  tokenManager.clearSession();
});

// ---------------------------------------------------------------------------
// US-SOL-02 — Detail
// ---------------------------------------------------------------------------

test("Application detail — success: renders applicant, organization and status", async () => {
  const app = application({
    status: "SUBMITTED",
    submittedAt: "2025-02-01T00:00:00.000Z",
  });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname === "/api/kernel/v1/membership-applications/app_1")
      return jsonResponse(app);
    if (url.pathname === "/api/kernel/v1/persons/per_1")
      return jsonResponse(person());
    if (url.pathname === `/api/kernel/v1/organizations/${ORG.id}`)
      return jsonResponse(ORG);
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getAllByText } = renderWithClient(
    React.createElement(ApplicationDetailContainer, { applicationId: "app_1" }),
  );

  await waitFor(() => assert.ok(getAllByText("Ada Lovelace").length > 0));
  await waitFor(() => assert.ok(getByText("Club Uno")));

  tokenManager.clearSession();
});

test("Application detail — not found: a 404 renders 'no encontrada', not a generic error", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname === "/api/kernel/v1/membership-applications/app_missing") {
      return problemResponse(404, "KERNEL_NOT_FOUND");
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText } = renderWithClient(
    React.createElement(ApplicationDetailContainer, {
      applicationId: "app_missing",
    }),
  );

  await waitFor(() => assert.ok(getByText("Solicitud no encontrada")));

  tokenManager.clearSession();
});

test("Application detail — forbidden: a 403 shows the institutional message", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname === "/api/kernel/v1/membership-applications/app_secret") {
      return problemResponse(403, "KERNEL_FORBIDDEN");
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText } = renderWithClient(
    React.createElement(ApplicationDetailContainer, {
      applicationId: "app_secret",
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
// US-SOL-03 — Create
// ---------------------------------------------------------------------------

test("Create application — success: submits CreateMembershipApplicationRequest and navigates to the new detail page", async () => {
  const created = application({ id: "app_new" });
  const backend = new MockBackend();
  let createBody: unknown;
  backend.kernelHandler = async (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (
      request.method === "POST" &&
      url.pathname === "/api/kernel/v1/membership-applications"
    ) {
      createBody = await request.json();
      return jsonResponse(created, 201);
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, router } = renderWithRouter(
    React.createElement(CreateApplicationDialog, { organizationId: ORG.id }),
  );

  fireEvent.click(getByText("Solicitar ingreso"));
  await waitFor(() =>
    assert.ok(
      getByText("Crear solicitud", { selector: "button[type=submit]" }),
    ),
  );
  fireEvent.click(
    getByText("Crear solicitud", { selector: "button[type=submit]" }),
  );

  await waitFor(() => {
    assert.deepEqual(createBody, { organizationId: ORG.id, message: null });
  });
  await waitFor(() =>
    assert.ok(router.pushCalls.includes("/applications/app_new")),
  );

  tokenManager.clearSession();
});

test("Create application — 409 duplicate open application: shows the institutional conflict message and keeps the dialog open", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (
      request.method === "POST" &&
      url.pathname === "/api/kernel/v1/membership-applications"
    ) {
      return problemResponse(409, "KERNEL_CONFLICT", {
        detail: "an open application already exists",
      });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText } = renderWithRouter(
    React.createElement(CreateApplicationDialog, { organizationId: ORG.id }),
  );

  fireEvent.click(getByText("Solicitar ingreso"));
  await waitFor(() =>
    assert.ok(
      getByText("Crear solicitud", { selector: "button[type=submit]" }),
    ),
  );
  fireEvent.click(
    getByText("Crear solicitud", { selector: "button[type=submit]" }),
  );

  await waitFor(() =>
    assert.ok(
      getByText("Ya tenés una solicitud abierta para esta organización."),
    ),
  );
  assert.ok(
    getByText("Crear solicitud", { selector: "button[type=submit]" }),
    "the dialog stays open on error, the form isn't lost",
  );

  tokenManager.clearSession();
});

// ---------------------------------------------------------------------------
// US-SOL-04 — Submit
// ---------------------------------------------------------------------------

test("Submit application — DRAFT -> SUBMITTED, gated by permission and status, calls submit (no optimistic change)", async () => {
  const draft = application({ status: "DRAFT" });
  const backend = new MockBackend();
  let submitCalled = false;
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse(["kernel.application.create.self"]);
    if (
      request.method === "POST" &&
      url.pathname === "/api/kernel/v1/membership-applications/app_1/submit"
    ) {
      submitCalled = true;
      return jsonResponse({ ...draft, status: "SUBMITTED" });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getByRole } = renderWithClient(
    React.createElement(SubmitApplicationDialog, {
      application: draft as never,
    }),
  );

  await waitFor(() => assert.ok(getByText("Enviar")));
  fireEvent.click(getByText("Enviar"));
  const dialog = await waitFor(() => getByRole("dialog"));
  const confirmButton = within(dialog).getByText("Enviar");
  assert.equal(submitCalled, false, "no request until confirm is clicked");
  fireEvent.click(confirmButton);

  await waitFor(() => assert.equal(submitCalled, true));

  tokenManager.clearSession();
});

test("Submit application — not offered on a SUBMITTED application (DRAFT -> SUBMITTED only)", async () => {
  const submitted = application({ status: "SUBMITTED" });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse(["kernel.application.create.self"]);
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { queryByText } = renderWithClient(
    React.createElement(SubmitApplicationDialog, {
      application: submitted as never,
    }),
  );

  await waitFor(() => assert.ok(document.body));
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(queryByText("Enviar"), null);

  tokenManager.clearSession();
});

test("Submit application — 409 invalid transition surfaces without a local status change", async () => {
  const draft = application({ status: "DRAFT" });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse(["kernel.application.create.self"]);
    if (
      request.method === "POST" &&
      url.pathname === "/api/kernel/v1/membership-applications/app_1/submit"
    ) {
      return problemResponse(409, "KERNEL_INVALID_TRANSITION", {
        detail: "application cannot be submitted",
      });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getByRole } = renderWithClient(
    React.createElement(SubmitApplicationDialog, {
      application: draft as never,
    }),
  );

  await waitFor(() => assert.ok(getByText("Enviar")));
  fireEvent.click(getByText("Enviar"));
  const dialog = await waitFor(() => getByRole("dialog"));
  fireEvent.click(within(dialog).getByText("Enviar"));

  await waitFor(() =>
    assert.ok(
      within(dialog).getByText(
        "Esta solicitud no puede pasar a ese estado en este momento.",
      ),
    ),
  );
  // Dialog still open — no silent success.
  assert.ok(within(dialog).getByText("Enviar"));

  tokenManager.clearSession();
});

// ---------------------------------------------------------------------------
// US-SOL-05 — Approve
// ---------------------------------------------------------------------------

test("Approve application — SUBMITTED -> APPROVED, gated by kernel.application.review, calls only approve (no /memberships/* call)", async () => {
  const submitted = application({ status: "SUBMITTED" });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse(["kernel.application.review"]);
    if (
      request.method === "POST" &&
      url.pathname === "/api/kernel/v1/membership-applications/app_1/approve"
    ) {
      return jsonResponse({
        ...submitted,
        status: "APPROVED",
        membershipId: "mem_new",
      });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getByRole } = renderWithClient(
    React.createElement(ApproveApplicationDialog, {
      application: submitted as never,
      personLabel: "Ada Lovelace",
    }),
  );

  await waitFor(() => assert.ok(getByText("Aprobar")));
  fireEvent.click(getByText("Aprobar"));
  const dialog = await waitFor(() => getByRole("dialog"));
  fireEvent.click(within(dialog).getByText("Aprobar"));

  await waitFor(() =>
    assert.ok(
      backend.kernelCalls.some((c) =>
        c.url.endsWith("/membership-applications/app_1/approve"),
      ),
    ),
  );

  const mutationCalls = backend.kernelCalls.filter((c) => c.method !== "GET");
  assert.equal(
    mutationCalls.length,
    1,
    "the only mutation call must be the approve endpoint itself",
  );
  assert.ok(
    mutationCalls[0]!.url.endsWith("/membership-applications/app_1/approve"),
  );
  assert.ok(
    !backend.kernelCalls.some((c) => c.url.includes("/memberships")),
    "approving an application must never call a /memberships/* endpoint directly — the Kernel creates/reactivates the membership itself",
  );

  tokenManager.clearSession();
});

test("Approve application — not offered without kernel.application.review", async () => {
  const submitted = application({ status: "SUBMITTED" });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { queryByText } = renderWithClient(
    React.createElement(ApproveApplicationDialog, {
      application: submitted as never,
      personLabel: "Ada Lovelace",
    }),
  );

  await waitFor(() => assert.ok(document.body));
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(queryByText("Aprobar"), null);

  tokenManager.clearSession();
});

// ---------------------------------------------------------------------------
// US-SOL-06 — Reject
// ---------------------------------------------------------------------------

test("Reject application — empty motivo blocks submit (no request issued)", async () => {
  const submitted = application({ status: "SUBMITTED" });
  const backend = new MockBackend();
  let rejectCalled = false;
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse(["kernel.application.review"]);
    if (
      request.method === "POST" &&
      url.pathname === "/api/kernel/v1/membership-applications/app_1/reject"
    ) {
      rejectCalled = true;
      return jsonResponse({ ...submitted, status: "REJECTED" });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getByRole } = renderWithClient(
    React.createElement(RejectApplicationDialog, {
      application: submitted as never,
      personLabel: "Ada Lovelace",
    }),
  );

  await waitFor(() => assert.ok(getByText("Rechazar")));
  fireEvent.click(getByText("Rechazar"));
  const dialog = await waitFor(() => getByRole("dialog"));
  fireEvent.click(within(dialog).getByText("Rechazar"));

  await waitFor(() =>
    assert.ok(within(dialog).getByText("El motivo es obligatorio.")),
  );
  assert.equal(
    rejectCalled,
    false,
    "an empty rejectionReason must never reach the mutation",
  );

  tokenManager.clearSession();
});

test("Reject application — motivo presente envía { rejectionReason }", async () => {
  const submitted = application({ status: "SUBMITTED" });
  const backend = new MockBackend();
  let rejectBody: unknown;
  backend.kernelHandler = async (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse(["kernel.application.review"]);
    if (
      request.method === "POST" &&
      url.pathname === "/api/kernel/v1/membership-applications/app_1/reject"
    ) {
      rejectBody = await request.json();
      return jsonResponse({ ...submitted, status: "REJECTED" });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getByRole, getByLabelText } = renderWithClient(
    React.createElement(RejectApplicationDialog, {
      application: submitted as never,
      personLabel: "Ada Lovelace",
    }),
  );

  await waitFor(() => assert.ok(getByText("Rechazar")));
  fireEvent.click(getByText("Rechazar"));
  const dialog = await waitFor(() => getByRole("dialog"));
  fireEvent.change(getByLabelText("Motivo", { exact: false }), {
    target: { value: "No cumple los requisitos" },
  });
  fireEvent.click(within(dialog).getByText("Rechazar"));

  await waitFor(() =>
    assert.deepEqual(rejectBody, {
      rejectionReason: "No cumple los requisitos",
    }),
  );

  tokenManager.clearSession();
});

// ---------------------------------------------------------------------------
// US-SOL-07 — Cancel + EXPIRED negative coverage
// ---------------------------------------------------------------------------

test("Cancel application — offered from DRAFT and SUBMITTED", async () => {
  for (const status of ["DRAFT", "SUBMITTED"]) {
    const app = application({ status });
    const backend = new MockBackend();
    let cancelCalled = false;
    backend.kernelHandler = (request) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith("/auth/me")) return meResponse();
      if (url.pathname.includes("/effective-permissions"))
        return permissionsResponse(["kernel.application.cancel.self"]);
      if (
        request.method === "POST" &&
        url.pathname === "/api/kernel/v1/membership-applications/app_1/cancel"
      ) {
        cancelCalled = true;
        return jsonResponse({ ...app, status: "CANCELLED" });
      }
      return problemResponse(404, "NOT_FOUND");
    };
    tokenManager.setSession(backend.issueToken(), 600);

    const { getByText, getByRole } = renderWithClient(
      React.createElement(CancelApplicationDialog, {
        application: app as never,
      }),
    );

    await waitFor(() => assert.ok(getByText("Cancelar solicitud")));
    fireEvent.click(getByText("Cancelar solicitud"));
    const dialog = await waitFor(() => getByRole("dialog"));
    fireEvent.click(within(dialog).getByText("Cancelar solicitud"));

    await waitFor(() => assert.equal(cancelCalled, true));

    tokenManager.clearSession();
    cleanup();
  }
});

test("Cancel application — never offered from APPROVED, REJECTED, CANCELLED or EXPIRED, even with full permissions", async () => {
  for (const status of ["APPROVED", "REJECTED", "CANCELLED", "EXPIRED"]) {
    const app = application({ status });
    const backend = new MockBackend();
    backend.kernelHandler = (request) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith("/auth/me")) return meResponse();
      if (url.pathname.includes("/effective-permissions")) {
        return permissionsResponse([
          "kernel.application.create.self",
          "kernel.application.cancel.self",
          "kernel.application.review",
        ]);
      }
      return problemResponse(404, "NOT_FOUND");
    };
    tokenManager.setSession(backend.issueToken(), 600);

    const { queryByText } = renderWithClient(
      React.createElement(ApplicationActionsRow, {
        application: app as never,
        personLabel: "Ada Lovelace",
      }),
    );

    await waitFor(() => assert.ok(document.body));
    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.equal(
      queryByText("Cancelar solicitud"),
      null,
      `cancel must not be offered on ${status}`,
    );

    tokenManager.clearSession();
    cleanup();
  }
});

test('EXPIRED — no "Expirar" action is ever offered, on any status, with full permissions', async () => {
  for (const status of [
    "DRAFT",
    "SUBMITTED",
    "APPROVED",
    "REJECTED",
    "CANCELLED",
    "EXPIRED",
  ]) {
    const app = application({ status });
    const backend = new MockBackend();
    backend.kernelHandler = (request) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith("/auth/me")) return meResponse();
      if (url.pathname.includes("/effective-permissions")) {
        return permissionsResponse([
          "kernel.application.create.self",
          "kernel.application.cancel.self",
          "kernel.application.review",
        ]);
      }
      return problemResponse(404, "NOT_FOUND");
    };
    tokenManager.setSession(backend.issueToken(), 600);

    const { queryByText } = renderWithClient(
      React.createElement(ApplicationActionsRow, {
        application: app as never,
        personLabel: "Ada Lovelace",
      }),
    );

    await waitFor(() => assert.ok(document.body));
    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.equal(
      queryByText(/expirar/i),
      null,
      `no "Expirar" control must ever render (status=${status}) — EXPIRED has no manual transition in kernel-openapi.yaml`,
    );

    tokenManager.clearSession();
    cleanup();
  }
});
