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
const { AuthoritiesContainer } =
  await import("../../src/features/appointments/containers/authorities-container.tsx");
const { AppointmentsListContainer } =
  await import("../../src/features/appointments/containers/appointments-list-container.tsx");
const { AppointmentDetailContainer } =
  await import("../../src/features/appointments/containers/appointment-detail-container.tsx");
const { CreateAppointmentDialog } =
  await import("../../src/features/appointments/forms/create-appointment-dialog.tsx");
const { AppointmentActionsRow } =
  await import("../../src/features/appointments/components/appointment-actions-row.tsx");

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

function positionDef(overrides: Record<string, unknown> = {}) {
  return {
    id: "pos_1",
    code: "CLUB_PRESIDENT",
    name: "Presidente de Club",
    description: null,
    organizationType: "CLUB",
    ownerOrganizationId: null,
    editPermissionCode: "kernel.position.manage",
    defaultRoleCode: "CLUB_PRESIDENT",
    isSingletonPerPeriod: true,
    isSystem: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function membership(overrides: Record<string, unknown> = {}) {
  return {
    id: "mem_1",
    organizationId: ORG.id,
    personId: "per_2",
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
    id: "per_2",
    firstName: "Beto",
    lastName: "Gómez",
    displayName: "Beto Gómez",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function period(overrides: Record<string, unknown> = {}) {
  return {
    id: "per_period1",
    organizationId: ORG.id,
    code: "2025-2026",
    name: "2025-2026",
    sequence: 1,
    startDate: "2025-07-01",
    endDate: "2026-06-30",
    status: "ACTIVE",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function appointment(overrides: Record<string, unknown> = {}) {
  return {
    id: "appt_1",
    organizationId: ORG.id,
    membershipId: membership().id,
    membershipOrganizationId: ORG.id,
    periodId: period().id,
    positionDefinitionId: positionDef().id,
    status: "ACTIVE",
    startsAt: "2025-07-01T00:00:00.000Z",
    endsAt: "2026-06-30T00:00:00.000Z",
    createdById: null,
    createdAt: "2025-01-01T00:00:00.000Z",
    activatedAt: null,
    endedAt: null,
    revokedAt: null,
    revokedById: null,
    revokeReason: null,
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

function withActiveOrg(element: React.ReactElement, organizationId = ORG.id) {
  return React.createElement(ActiveOrganizationProvider, {
    value: fakeActiveOrganization(organizationId),
    children: element,
  });
}

/** Common handler stubs every test needs: auth + permissions + person/membership lookups used by bounded row cells. */
function baseHandlers(perms: string[]) {
  return (url: URL) => {
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse(perms);
    if (url.pathname === "/api/kernel/v1/memberships/mem_1")
      return jsonResponse(membership());
    if (url.pathname === "/api/kernel/v1/persons/per_2")
      return jsonResponse(person());
    if (url.pathname === "/api/kernel/v1/periods/per_period1")
      return jsonResponse(period());
    return null;
  };
}

// ---------------------------------------------------------------------------
// US-APP-01 — Autoridades vigentes
// ---------------------------------------------------------------------------

test("Authorities — loading then success: renders a row with position + resolved person name", async () => {
  const backend = new MockBackend();
  const base = baseHandlers([]);
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    const handled = base(url);
    if (handled) return handled;
    if (url.pathname.endsWith("/authorities/current"))
      return jsonResponse([appointment()]);
    if (url.pathname.endsWith("/position-definitions"))
      return jsonResponse([positionDef()]);
    if (request.method === "GET" && url.pathname.endsWith("/organizations")) {
      return jsonResponse({ items: [ORG], pageInfo: { hasMore: false } });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText } = renderWithRouter(
    withActiveOrg(React.createElement(AuthoritiesContainer)),
  );

  await waitFor(() => assert.ok(getByText("Presidente de Club")));
  await waitFor(() => assert.ok(getByText("Beto Gómez")));

  tokenManager.clearSession();
});

test("Authorities — empty: renders a DataState", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname.endsWith("/authorities/current")) return jsonResponse([]);
    if (url.pathname.endsWith("/position-definitions")) return jsonResponse([]);
    if (request.method === "GET" && url.pathname.endsWith("/organizations")) {
      return jsonResponse({ items: [ORG], pageInfo: { hasMore: false } });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText } = renderWithRouter(
    withActiveOrg(React.createElement(AuthoritiesContainer)),
  );

  await waitFor(() => assert.ok(getByText("Sin autoridades vigentes")));

  tokenManager.clearSession();
});

test("Authorities — forbidden: a 403 shows the institutional message", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname.endsWith("/authorities/current")) {
      return problemResponse(403, "KERNEL_FORBIDDEN");
    }
    if (url.pathname.endsWith("/position-definitions")) return jsonResponse([]);
    if (request.method === "GET" && url.pathname.endsWith("/organizations")) {
      return jsonResponse({ items: [ORG], pageInfo: { hasMore: false } });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText } = renderWithRouter(
    withActiveOrg(React.createElement(AuthoritiesContainer)),
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

test("Authorities — anti-N+1: three rows sharing one membership/person resolve each with a single request", async () => {
  const backend = new MockBackend();
  const appointments = [
    appointment({ id: "appt_a", positionDefinitionId: "pos_1" }),
    appointment({ id: "appt_b", positionDefinitionId: "pos_1" }),
    appointment({ id: "appt_c", positionDefinitionId: "pos_1" }),
  ];
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname.endsWith("/authorities/current"))
      return jsonResponse(appointments);
    if (url.pathname.endsWith("/position-definitions"))
      return jsonResponse([positionDef()]);
    if (url.pathname === "/api/kernel/v1/memberships/mem_1")
      return jsonResponse(membership());
    if (url.pathname === "/api/kernel/v1/persons/per_2")
      return jsonResponse(person());
    if (request.method === "GET" && url.pathname.endsWith("/organizations")) {
      return jsonResponse({ items: [ORG], pageInfo: { hasMore: false } });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getAllByText } = renderWithRouter(
    withActiveOrg(React.createElement(AuthoritiesContainer)),
  );

  await waitFor(() => assert.equal(getAllByText("Beto Gómez").length, 3));

  const membershipCalls = backend.kernelCalls.filter(
    (c) => c.url === "https://kernel.test/api/kernel/v1/memberships/mem_1",
  );
  const personCalls = backend.kernelCalls.filter(
    (c) => c.url === "https://kernel.test/api/kernel/v1/persons/per_2",
  );
  assert.equal(
    membershipCalls.length,
    1,
    "three rows sharing one membership must dedupe to one request",
  );
  assert.equal(
    personCalls.length,
    1,
    "three rows sharing one person must dedupe to one request",
  );

  tokenManager.clearSession();
});

// ---------------------------------------------------------------------------
// US-APP-02 — Listar cargos
// ---------------------------------------------------------------------------

test("Appointments list — loading then success: renders position/person/period/status", async () => {
  const backend = new MockBackend();
  const base = baseHandlers([]);
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    const handled = base(url);
    if (handled) return handled;
    if (url.pathname.endsWith("/appointments") && request.method === "GET") {
      return jsonResponse([appointment()]);
    }
    if (url.pathname.endsWith("/position-definitions"))
      return jsonResponse([positionDef()]);
    if (url.pathname.endsWith("/periods")) return jsonResponse([period()]);
    if (request.method === "GET" && url.pathname.endsWith("/organizations")) {
      return jsonResponse({ items: [ORG], pageInfo: { hasMore: false } });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText } = renderWithRouter(
    withActiveOrg(React.createElement(AppointmentsListContainer)),
  );

  await waitFor(() =>
    assert.ok(getByText("Presidente de Club", { selector: "td" })),
  );
  await waitFor(() => assert.ok(getByText("Beto Gómez")));
  // Now a link to /periods/[periodId] (Fase 5↔6 integration), not a plain span.
  await waitFor(() => assert.ok(getByText("2025-2026", { selector: "a" })));

  tokenManager.clearSession();
});

test("Appointments list — empty: renders a DataState", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname.endsWith("/appointments") && request.method === "GET")
      return jsonResponse([]);
    if (url.pathname.endsWith("/position-definitions")) return jsonResponse([]);
    if (url.pathname.endsWith("/periods")) return jsonResponse([]);
    if (request.method === "GET" && url.pathname.endsWith("/organizations")) {
      return jsonResponse({ items: [ORG], pageInfo: { hasMore: false } });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText } = renderWithRouter(
    withActiveOrg(React.createElement(AppointmentsListContainer)),
  );

  await waitFor(() => assert.ok(getByText("Sin cargos")));

  tokenManager.clearSession();
});

test("Appointments list — filter by status re-requests with status in the query", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname.endsWith("/appointments") && request.method === "GET") {
      return jsonResponse([appointment()]);
    }
    if (url.pathname.endsWith("/position-definitions"))
      return jsonResponse([positionDef()]);
    if (url.pathname.endsWith("/periods")) return jsonResponse([period()]);
    if (request.method === "GET" && url.pathname.endsWith("/organizations")) {
      return jsonResponse({ items: [ORG], pageInfo: { hasMore: false } });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByLabelText } = renderWithRouter(
    withActiveOrg(React.createElement(AppointmentsListContainer)),
  );

  await waitFor(() => assert.ok(getByLabelText("Filtrar por estado")));
  fireEvent.change(getByLabelText("Filtrar por estado"), {
    target: { value: "REVOKED" },
  });

  await waitFor(() => {
    const filtered = backend.kernelCalls.filter(
      (c) =>
        c.url.includes("/appointments?") && c.url.includes("status=REVOKED"),
    );
    assert.ok(filtered.length > 0, "expected a request with status=REVOKED");
  });

  tokenManager.clearSession();
});

// ---------------------------------------------------------------------------
// US-APP-03 — Detalle de cargo
// ---------------------------------------------------------------------------

test("Appointment detail — success: renders position, person, organization, period, status", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname === "/api/kernel/v1/appointments/appt_1")
      return jsonResponse(appointment());
    if (url.pathname.endsWith("/position-definitions"))
      return jsonResponse([positionDef()]);
    if (url.pathname === "/api/kernel/v1/organizations/org_1")
      return jsonResponse(ORG);
    if (url.pathname === "/api/kernel/v1/memberships/mem_1")
      return jsonResponse(membership());
    if (url.pathname === "/api/kernel/v1/persons/per_2")
      return jsonResponse(person());
    if (url.pathname === "/api/kernel/v1/periods/per_period1")
      return jsonResponse(period());
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getAllByText } = renderWithClient(
    React.createElement(AppointmentDetailContainer, {
      appointmentId: "appt_1",
    }),
  );

  await waitFor(() => assert.ok(getAllByText("Presidente de Club").length > 0));
  await waitFor(() => assert.ok(getByText("Beto Gómez")));
  await waitFor(() => assert.ok(getByText("Club Uno", { selector: "dd" })));
  await waitFor(() => assert.ok(getByText("2025-2026")));
  await waitFor(() => assert.ok(getByText("Activo")));

  tokenManager.clearSession();
});

test("Appointment detail — not found: a 404 renders 'no encontrado'", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname === "/api/kernel/v1/appointments/appt_missing") {
      return problemResponse(404, "KERNEL_NOT_FOUND");
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText } = renderWithClient(
    React.createElement(AppointmentDetailContainer, {
      appointmentId: "appt_missing",
    }),
  );

  await waitFor(() => assert.ok(getByText("Cargo no encontrado")));

  tokenManager.clearSession();
});

test("Appointment detail — forbidden: a 403 shows the institutional message", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname === "/api/kernel/v1/appointments/appt_secret") {
      return problemResponse(403, "KERNEL_FORBIDDEN");
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText } = renderWithClient(
    React.createElement(AppointmentDetailContainer, {
      appointmentId: "appt_secret",
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
// US-APP-04 — Crear cargo (nominar)
// ---------------------------------------------------------------------------

test("Create appointment — success: submits CreateAppointmentRequest for a CLUB position and navigates to the new detail page", async () => {
  const created = appointment({ id: "appt_new", status: "NOMINATED" });
  const backend = new MockBackend();
  let createBody: unknown;
  backend.kernelHandler = async (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname === "/api/kernel/v1/organizations/org_1")
      return jsonResponse(ORG);
    if (url.pathname.endsWith("/position-definitions"))
      return jsonResponse([positionDef()]);
    if (url.pathname.endsWith("/periods")) return jsonResponse([period()]);
    if (url.pathname === "/api/kernel/v1/organizations/org_1/memberships") {
      return jsonResponse({
        items: [membership()],
        pageInfo: { hasMore: false },
      });
    }
    if (url.pathname === "/api/kernel/v1/persons/per_2")
      return jsonResponse(person());
    if (
      request.method === "POST" &&
      url.pathname.endsWith("/organizations/org_1/appointments")
    ) {
      createBody = await request.json();
      return jsonResponse(created, 201);
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getByLabelText, router } = renderWithRouter(
    React.createElement(CreateAppointmentDialog, { organizationId: ORG.id }),
  );

  fireEvent.click(getByText("Nominar cargo", { selector: "button" }));
  await waitFor(() => assert.ok(getByLabelText(/^Cargo/)));

  await waitFor(() => assert.ok(getByText("Presidente de Club")));
  fireEvent.change(getByLabelText(/^Cargo/), {
    target: { value: "pos_1" },
  });
  fireEvent.change(getByLabelText("Período", { exact: false }), {
    target: { value: "per_period1" },
  });
  await waitFor(() => assert.ok(getByText("Beto Gómez")));
  fireEvent.change(getByLabelText("Membresía habilitante", { exact: false }), {
    target: { value: "mem_1" },
  });

  fireEvent.click(
    getByText("Nominar cargo", { selector: "button[type=submit]" }),
  );

  await waitFor(() => assert.ok(createBody));
  assert.deepEqual(createBody, {
    membershipId: "mem_1",
    periodId: "per_period1",
    positionDefinitionId: "pos_1",
  });
  await waitFor(() =>
    assert.ok(router.pushCalls.includes(`/appointments/${created.id}`)),
  );

  tokenManager.clearSession();
});

test("Create appointment — 422 invalid membership scope: shows the institutional validation message, dialog stays open", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname === "/api/kernel/v1/organizations/org_1")
      return jsonResponse(ORG);
    if (url.pathname.endsWith("/position-definitions"))
      return jsonResponse([positionDef()]);
    if (url.pathname.endsWith("/periods")) return jsonResponse([period()]);
    if (url.pathname === "/api/kernel/v1/organizations/org_1/memberships") {
      return jsonResponse({
        items: [membership()],
        pageInfo: { hasMore: false },
      });
    }
    if (url.pathname === "/api/kernel/v1/persons/per_2")
      return jsonResponse(person());
    if (
      request.method === "POST" &&
      url.pathname.endsWith("/organizations/org_1/appointments")
    ) {
      return problemResponse(422, "KERNEL_VALIDATION", {
        detail: "membership not active",
      });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getByLabelText } = renderWithRouter(
    React.createElement(CreateAppointmentDialog, { organizationId: ORG.id }),
  );

  fireEvent.click(getByText("Nominar cargo", { selector: "button" }));
  await waitFor(() => assert.ok(getByLabelText(/^Cargo/)));
  await waitFor(() => assert.ok(getByText("Presidente de Club")));
  fireEvent.change(getByLabelText(/^Cargo/), {
    target: { value: "pos_1" },
  });
  await waitFor(() => assert.ok(getByText("2025-2026")));
  fireEvent.change(getByLabelText("Período", { exact: false }), {
    target: { value: "per_period1" },
  });
  await waitFor(() => assert.ok(getByText("Beto Gómez")));
  fireEvent.change(getByLabelText("Membresía habilitante", { exact: false }), {
    target: { value: "mem_1" },
  });

  fireEvent.click(
    getByText("Nominar cargo", { selector: "button[type=submit]" }),
  );

  await waitFor(() =>
    assert.ok(
      getByText("Los datos ingresados no son válidos para este cargo."),
    ),
  );
  assert.ok(getByLabelText(/^Cargo/), "the dialog stays open on error");

  tokenManager.clearSession();
});

test("Create appointment — the trigger is only rendered by the list container with kernel.appointment.create", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname.endsWith("/appointments") && request.method === "GET")
      return jsonResponse([]);
    if (url.pathname.endsWith("/position-definitions")) return jsonResponse([]);
    if (url.pathname.endsWith("/periods")) return jsonResponse([]);
    if (request.method === "GET" && url.pathname.endsWith("/organizations")) {
      return jsonResponse({ items: [ORG], pageInfo: { hasMore: false } });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, queryByText } = renderWithRouter(
    withActiveOrg(React.createElement(AppointmentsListContainer)),
  );

  await waitFor(() => assert.ok(getByText("Sin cargos")));
  assert.equal(queryByText("Nominar cargo"), null);

  tokenManager.clearSession();
});

// ---------------------------------------------------------------------------
// US-APP-05 a US-APP-08 — Ciclo de vida del cargo
// ---------------------------------------------------------------------------

test("Mark elected — success: NOMINATED shows the action, confirms, calls elect (no premature status change)", async () => {
  const nominated = appointment({ id: "appt_nom1", status: "NOMINATED" });
  const backend = new MockBackend();
  let electCalled = false;
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions")) {
      return permissionsResponse(["kernel.appointment.create"]);
    }
    if (
      request.method === "POST" &&
      url.pathname.endsWith("/appointments/appt_nom1/elect")
    ) {
      electCalled = true;
      return jsonResponse({ ...nominated, status: "ELECTED" });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getByRole } = renderWithClient(
    React.createElement(AppointmentActionsRow, {
      appointment: nominated as never,
    }),
  );

  await waitFor(() => assert.ok(getByText("Marcar electo")));
  fireEvent.click(getByText("Marcar electo"));

  const dialog = await waitFor(() => getByRole("dialog"));
  const confirmButton = within(dialog).getByText("Marcar electo");
  assert.equal(electCalled, false, "no request until confirm is clicked");
  fireEvent.click(confirmButton);

  await waitFor(() => assert.equal(electCalled, true));

  tokenManager.clearSession();
});

test("Mark elected — hidden without kernel.appointment.create", async () => {
  const nominated = appointment({ id: "appt_nom2", status: "NOMINATED" });
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
    React.createElement(AppointmentActionsRow, {
      appointment: nominated as never,
    }),
  );

  await waitFor(() => assert.equal(queryByText("Marcar electo"), null));

  tokenManager.clearSession();
});

test("Activate appointment — 409 singleton conflict surfaces in the dialog, never applies locally", async () => {
  const elected = appointment({ id: "appt_elect1", status: "ELECTED" });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions")) {
      return permissionsResponse(["kernel.appointment.activate"]);
    }
    if (
      request.method === "POST" &&
      url.pathname.endsWith("/appointments/appt_elect1/activate")
    ) {
      return problemResponse(409, "KERNEL_CONFLICT", {
        detail: "an ACTIVE holder already exists for this singleton position",
      });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getByRole } = renderWithClient(
    React.createElement(AppointmentActionsRow, {
      appointment: elected as never,
    }),
  );

  await waitFor(() => assert.ok(getByText("Activar")));
  fireEvent.click(getByText("Activar"));

  const dialog = await waitFor(() => getByRole("dialog"));
  fireEvent.click(within(dialog).getByText("Activar"));

  await waitFor(() =>
    assert.ok(
      within(dialog).getByText(
        "Este cargo no puede pasar a ese estado en este momento.",
      ),
    ),
  );
  // Still open with the confirm action visible — no silent success.
  assert.ok(within(dialog).getByText("Activar cargo"));

  tokenManager.clearSession();
});

test("Activate appointment — hidden without kernel.appointment.activate", async () => {
  const elected = appointment({ id: "appt_elect2", status: "ELECTED" });
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
    React.createElement(AppointmentActionsRow, {
      appointment: elected as never,
    }),
  );

  await waitFor(() => assert.equal(queryByText("Activar"), null));

  tokenManager.clearSession();
});

test("End appointment — success: ACTIVE shows the action, confirms, calls end", async () => {
  const active = appointment({ id: "appt_active1", status: "ACTIVE" });
  const backend = new MockBackend();
  let endCalled = false;
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions")) {
      return permissionsResponse(["kernel.appointment.end"]);
    }
    if (
      request.method === "POST" &&
      url.pathname.endsWith("/appointments/appt_active1/end")
    ) {
      endCalled = true;
      return jsonResponse({ ...active, status: "ENDED" });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getByRole } = renderWithClient(
    React.createElement(AppointmentActionsRow, {
      appointment: active as never,
    }),
  );

  await waitFor(() => assert.ok(getByText("Finalizar")));
  fireEvent.click(getByText("Finalizar"));
  const dialog = await waitFor(() => getByRole("dialog"));
  assert.equal(endCalled, false);
  fireEvent.click(within(dialog).getByText("Finalizar"));

  await waitFor(() => assert.equal(endCalled, true));

  tokenManager.clearSession();
});

test("Revoke appointment — requires a reason: no request fires until revokeReason is filled", async () => {
  const active = appointment({ id: "appt_active2", status: "ACTIVE" });
  const backend = new MockBackend();
  let revokeCalled = false;
  let revokeBody: unknown;
  backend.kernelHandler = async (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions")) {
      return permissionsResponse(["kernel.appointment.revoke"]);
    }
    if (
      request.method === "POST" &&
      url.pathname.endsWith("/appointments/appt_active2/revoke")
    ) {
      revokeCalled = true;
      revokeBody = await request.json();
      return jsonResponse({
        ...active,
        status: "REVOKED",
        revokeReason: (revokeBody as { revokeReason: string }).revokeReason,
      });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getByRole, getByLabelText } = renderWithClient(
    React.createElement(AppointmentActionsRow, {
      appointment: active as never,
    }),
  );

  await waitFor(() => assert.ok(getByText("Revocar")));
  fireEvent.click(getByText("Revocar"));
  const dialog = await waitFor(() => getByRole("dialog"));

  fireEvent.click(within(dialog).getByText("Revocar"));
  assert.equal(revokeCalled, false, "empty reason must not submit");
  await waitFor(() =>
    assert.ok(within(dialog).getByText("El motivo es obligatorio.")),
  );

  fireEvent.change(
    getByLabelText("Motivo de la revocación", { exact: false }),
    {
      target: { value: "Renuncia del titular" },
    },
  );
  fireEvent.click(within(dialog).getByText("Revocar"));

  await waitFor(() => assert.equal(revokeCalled, true));
  assert.deepEqual(revokeBody, { revokeReason: "Renuncia del titular" });

  tokenManager.clearSession();
});

test("Revoke appointment — hidden without kernel.appointment.revoke", async () => {
  const active = appointment({ id: "appt_active3", status: "ACTIVE" });
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
    React.createElement(AppointmentActionsRow, {
      appointment: active as never,
    }),
  );

  await waitFor(() => assert.equal(queryByText("Revocar"), null));

  tokenManager.clearSession();
});

test("Appointment actions — terminal statuses (ENDED/REVOKED) render no lifecycle actions", async () => {
  const ended = appointment({ id: "appt_ended1", status: "ENDED" });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions")) {
      return permissionsResponse([
        "kernel.appointment.create",
        "kernel.appointment.activate",
        "kernel.appointment.end",
        "kernel.appointment.revoke",
      ]);
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { container } = renderWithClient(
    React.createElement(AppointmentActionsRow, { appointment: ended as never }),
  );

  await waitFor(() => assert.ok(container));
  assert.equal(container.querySelectorAll("button").length, 0);

  tokenManager.clearSession();
});
