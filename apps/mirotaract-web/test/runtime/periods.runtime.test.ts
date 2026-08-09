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
// across components get ambiguous matches.
afterEach(cleanup);

const { tokenManager } =
  await import("../../src/lib/api/client/token-manager.ts");
const { ActiveOrganizationProvider } =
  await import("../../src/features/shell/active-organization-context.tsx");
const { PeriodsListContainer } =
  await import("../../src/features/periods/containers/periods-list-container.tsx");
const { PeriodDetailContainer } =
  await import("../../src/features/periods/containers/period-detail-container.tsx");
const { CreatePeriodDialog } =
  await import("../../src/features/periods/forms/create-period-dialog.tsx");
const { EditDraftPeriodDialog } =
  await import("../../src/features/periods/forms/edit-draft-period-dialog.tsx");
const { SchedulePeriodDialog } =
  await import("../../src/features/periods/forms/schedule-period-dialog.tsx");
const { ActivatePeriodDialog } =
  await import("../../src/features/periods/forms/activate-period-dialog.tsx");
const { ClosePeriodDialog } =
  await import("../../src/features/periods/forms/close-period-dialog.tsx");
const { CancelPeriodDialog } =
  await import("../../src/features/periods/forms/cancel-period-dialog.tsx");

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

function period(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "prd_x",
    organizationId: "org_1",
    code: "P2526",
    name: "Período 2025-2026",
    sequence: 1,
    startDate: "2025-07-01",
    endDate: "2026-06-30",
    status: "DRAFT",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    closedAt: null,
    ...overrides,
  };
}

/**
 * `PeriodsListContainer` always calls `useActiveOrganizationContext()` —
 * even when a `?organization=` URL param wins — so every render needs an
 * `ActiveOrganizationProvider` ancestor, same as it would inside
 * `<DashboardShell>` in the real app.
 */
function activeOrgValue(
  organizationId: string | undefined,
  setActiveOrganizationId: (id: string) => void = () => {
    throw new Error("setActiveOrganizationId must not be called by /periods");
  },
) {
  return {
    organizationId,
    organization: organizationId
      ? { id: organizationId, name: "Org Activa" }
      : undefined,
    isLoading: false,
    availableMemberships: [],
    setActiveOrganizationId,
  } as never;
}

function renderPeriodsList(
  options: {
    activeOrganizationId?: string;
    setActiveOrganizationId?: (id: string) => void;
    initialSearchParams?: URLSearchParams;
  } = {},
) {
  return renderWithRouter(
    React.createElement(
      ActiveOrganizationProvider,
      {
        value: activeOrgValue(
          options.activeOrganizationId,
          options.setActiveOrganizationId,
        ),
      } as never,
      React.createElement(PeriodsListContainer),
    ),
    {
      pathname: "/periods",
      initialSearchParams: options.initialSearchParams,
    },
  );
}

// ---------------------------------------------------------------------------
// US-PRD-01 — Listing
// ---------------------------------------------------------------------------

test("Periods list — explicit ?organization= param wins over the active organization, never touches it", async () => {
  const draft = period({
    id: "prd_1",
    name: "Período URL",
    organizationId: "org_url",
  });
  const backend = new MockBackend();
  let setActiveCalls = 0;
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname === "/api/kernel/v1/organizations") {
      return jsonResponse({ items: [], pageInfo: { hasMore: false } });
    }
    if (url.pathname === "/api/kernel/v1/organizations/org_url/periods") {
      return jsonResponse([draft]);
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText } = renderPeriodsList({
    activeOrganizationId: "org_ctx",
    setActiveOrganizationId: () => {
      setActiveCalls += 1;
    },
    initialSearchParams: new URLSearchParams("organization=org_url"),
  });

  await waitFor(() => assert.ok(getByText("Período URL")));

  const requestedUrls = backend.kernelCalls
    .filter((c) => c.url.includes("/periods"))
    .map((c) => c.url);
  assert.ok(
    requestedUrls.every((u) => u.includes("org_url")),
    "must request the URL-scoped organization's periods, never org_ctx",
  );
  assert.equal(
    setActiveCalls,
    0,
    "opening /periods?organization=X must never change the Shell's active organization",
  );

  tokenManager.clearSession();
});

test("Periods list — no ?organization= param: falls back to the active organization from context", async () => {
  const draft = period({
    id: "prd_2",
    name: "Período Contexto",
    organizationId: "org_ctx",
  });
  const backend = new MockBackend();
  let setActiveCalls = 0;
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname === "/api/kernel/v1/organizations") {
      return jsonResponse({ items: [], pageInfo: { hasMore: false } });
    }
    if (url.pathname === "/api/kernel/v1/organizations/org_ctx/periods") {
      return jsonResponse([draft]);
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText } = renderPeriodsList({
    activeOrganizationId: "org_ctx",
    setActiveOrganizationId: () => {
      setActiveCalls += 1;
    },
  });

  await waitFor(() => assert.ok(getByText("Período Contexto")));
  assert.equal(setActiveCalls, 0);

  tokenManager.clearSession();
});

test("Periods list — empty: renders a DataState, not a blank table", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname === "/api/kernel/v1/organizations") {
      return jsonResponse({ items: [], pageInfo: { hasMore: false } });
    }
    if (url.pathname === "/api/kernel/v1/organizations/org_ctx/periods") {
      return jsonResponse([]);
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText } = renderPeriodsList({ activeOrganizationId: "org_ctx" });

  await waitFor(() => assert.ok(getByText("Sin períodos")));

  tokenManager.clearSession();
});

test('Periods list — forbidden: a 403 shows the institutional message, never "Error 403"', async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname === "/api/kernel/v1/organizations") {
      return jsonResponse({ items: [], pageInfo: { hasMore: false } });
    }
    if (url.pathname === "/api/kernel/v1/organizations/org_ctx/periods") {
      return problemResponse(403, "KERNEL_FORBIDDEN");
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, queryByText } = renderPeriodsList({
    activeOrganizationId: "org_ctx",
  });

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

test("Periods list — status filter change re-requests with that status in the query", async () => {
  const draft = period({ id: "prd_3", organizationId: "org_ctx" });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname === "/api/kernel/v1/organizations") {
      return jsonResponse({ items: [], pageInfo: { hasMore: false } });
    }
    if (url.pathname === "/api/kernel/v1/organizations/org_ctx/periods") {
      return jsonResponse([draft]);
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByLabelText } = renderPeriodsList({
    activeOrganizationId: "org_ctx",
  });

  await waitFor(() => assert.ok(getByLabelText("Filtrar por estado")));

  fireEvent.change(getByLabelText("Filtrar por estado"), {
    target: { value: "ACTIVE" },
  });

  await waitFor(() => {
    const filtered = backend.kernelCalls.filter(
      (c) => c.url.includes("/periods?") && c.url.includes("status=ACTIVE"),
    );
    assert.ok(filtered.length > 0);
  });

  tokenManager.clearSession();
});

test("Periods list — without kernel.period.create, the create trigger is hidden", async () => {
  const draft = period({ id: "prd_4", organizationId: "org_ctx" });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname === "/api/kernel/v1/organizations") {
      return jsonResponse({ items: [], pageInfo: { hasMore: false } });
    }
    if (url.pathname === "/api/kernel/v1/organizations/org_ctx/periods") {
      return jsonResponse([draft]);
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { queryByText, getByText } = renderPeriodsList({
    activeOrganizationId: "org_ctx",
  });

  await waitFor(() => assert.ok(getByText(draft.code as string)));
  assert.equal(queryByText("Crear período"), null);

  tokenManager.clearSession();
});

// ---------------------------------------------------------------------------
// US-PRD-03 — Detail
// ---------------------------------------------------------------------------

test("Period detail — success: renders name/code and doesn't touch ActiveOrganizationContext", async () => {
  const draft = period({ id: "prd_5", name: "Período Detalle", code: "P-DET" });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname === "/api/kernel/v1/periods/prd_5")
      return jsonResponse(draft);
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  // No ActiveOrganizationProvider anywhere in this tree — if the container
  // needed it, this would throw instead of rendering.
  const { getAllByText } = renderWithClient(
    React.createElement(PeriodDetailContainer, { periodId: "prd_5" }),
  );

  await waitFor(() => assert.ok(getAllByText("Período Detalle").length > 0));
  assert.ok(getAllByText("P-DET").length > 0);

  tokenManager.clearSession();
});

test("Period detail — not found: a 404 renders 'no encontrado', not a generic error", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname === "/api/kernel/v1/periods/prd_missing")
      return problemResponse(404, "KERNEL_NOT_FOUND");
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText } = renderWithClient(
    React.createElement(PeriodDetailContainer, { periodId: "prd_missing" }),
  );

  await waitFor(() => assert.ok(getByText("Período no encontrado")));

  tokenManager.clearSession();
});

test("Period detail — forbidden: a 403 shows the institutional message", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (url.pathname === "/api/kernel/v1/periods/prd_secret")
      return problemResponse(403, "KERNEL_FORBIDDEN");
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText } = renderWithClient(
    React.createElement(PeriodDetailContainer, { periodId: "prd_secret" }),
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
// US-PRD-04 — Create draft
// ---------------------------------------------------------------------------

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

test("Create period — success: submits CreatePeriodRequest and navigates to the new detail page", async () => {
  const created = period({
    id: "prd_new",
    name: "Período Nuevo",
    code: "PNEW",
    sequence: 3,
  });
  const backend = new MockBackend();
  let createBody: unknown;
  backend.kernelHandler = async (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (
      request.method === "POST" &&
      url.pathname === "/api/kernel/v1/organizations/org_1/periods"
    ) {
      createBody = await request.json();
      return jsonResponse(created, 201);
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getByLabelText, router } = renderWithRouter(
    React.createElement(CreatePeriodDialog, { organizationId: "org_1" }),
  );

  fireEvent.click(getByText("Crear período"));
  await waitFor(() => assert.ok(getByLabelText("Nombre", { exact: false })));

  fillCreateForm(getByLabelText, {
    Nombre: "Período Nuevo",
    Código: "PNEW",
    Secuencia: "3",
  });
  fireEvent.change(getByLabelText("Fecha de inicio", { exact: false }), {
    target: { value: "2025-07-01" },
  });
  fireEvent.change(getByLabelText("Fecha de fin", { exact: false }), {
    target: { value: "2026-06-30" },
  });

  fireEvent.click(
    getByText("Crear período", { selector: "button[type=submit]" }),
  );

  await waitFor(() => {
    assert.deepEqual(createBody, {
      code: "PNEW",
      name: "Período Nuevo",
      sequence: 3,
      startDate: "2025-07-01",
      endDate: "2026-06-30",
    });
  });

  await waitFor(() =>
    assert.ok(router.pushCalls.includes(`/periods/${created.id}`)),
  );

  tokenManager.clearSession();
});

test("Create period — invalid dates: blocked client-side per CA-PER-01/01a, no request sent", async () => {
  const backend = new MockBackend();
  let createCalled = false;
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse([]);
    if (
      request.method === "POST" &&
      url.pathname === "/api/kernel/v1/organizations/org_1/periods"
    ) {
      createCalled = true;
      return jsonResponse(period({}), 201);
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getByLabelText } = renderWithRouter(
    React.createElement(CreatePeriodDialog, { organizationId: "org_1" }),
  );

  fireEvent.click(getByText("Crear período"));
  await waitFor(() => assert.ok(getByLabelText("Nombre", { exact: false })));

  fillCreateForm(getByLabelText, {
    Nombre: "Período Inválido",
    Código: "PINV",
    Secuencia: "1",
  });
  // Not the 1st of July, and not the 30th of June of the following year.
  fireEvent.change(getByLabelText("Fecha de inicio", { exact: false }), {
    target: { value: "2025-08-01" },
  });
  fireEvent.change(getByLabelText("Fecha de fin", { exact: false }), {
    target: { value: "2026-01-01" },
  });

  fireEvent.click(
    getByText("Crear período", { selector: "button[type=submit]" }),
  );

  await waitFor(() => assert.ok(getByText("Debe ser 1 de julio.")));
  assert.ok(getByText("Debe ser 30 de junio del año siguiente."));
  assert.equal(
    createCalled,
    false,
    "an invalid date range must never reach the Kernel",
  );

  tokenManager.clearSession();
});

// ---------------------------------------------------------------------------
// US-PRD-05 — Edit draft
// ---------------------------------------------------------------------------

test("Edit draft period — success: PATCHes UpdatePeriodRequest fields", async () => {
  const draft = period({ id: "prd_edit1", status: "DRAFT" });
  const backend = new MockBackend();
  let patchBody: unknown;
  backend.kernelHandler = async (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse(["kernel.period.update"]);
    if (
      request.method === "PATCH" &&
      url.pathname === "/api/kernel/v1/periods/prd_edit1"
    ) {
      patchBody = await request.json();
      return jsonResponse({ ...draft, name: "Período Editado" });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getByLabelText } = renderWithClient(
    React.createElement(EditDraftPeriodDialog, { period: draft as never }),
  );

  await waitFor(() => assert.ok(getByText("Editar")));
  fireEvent.click(getByText("Editar"));

  await waitFor(() => assert.ok(getByLabelText("Nombre", { exact: false })));
  fireEvent.change(getByLabelText("Nombre", { exact: false }), {
    target: { value: "Período Editado" },
  });
  fireEvent.click(getByText("Guardar cambios"));

  await waitFor(() => assert.ok(patchBody));
  assert.deepEqual(patchBody, {
    name: "Período Editado",
    startDate: draft.startDate,
    endDate: draft.endDate,
  });

  tokenManager.clearSession();
});

test("Edit draft period — adapter gate: not offered once the period isn't DRAFT", async () => {
  const scheduled = period({ id: "prd_edit2", status: "SCHEDULED" });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse(["kernel.period.update"]);
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { container, queryByText } = renderWithClient(
    React.createElement(EditDraftPeriodDialog, { period: scheduled as never }),
  );

  assert.equal(queryByText("Editar"), null);
  assert.equal(container.textContent, "");

  tokenManager.clearSession();
});

// ---------------------------------------------------------------------------
// US-PRD-06/07/08/09 — Lifecycle
// ---------------------------------------------------------------------------

test("Schedule period — visible only with permission + DRAFT status, confirms, then calls schedule (no optimistic change)", async () => {
  const draft = period({ id: "prd_sched1", status: "DRAFT" });
  const backend = new MockBackend();
  let scheduleCalled = false;
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse(["kernel.period.update"]);
    if (
      request.method === "POST" &&
      url.pathname === "/api/kernel/v1/periods/prd_sched1/schedule"
    ) {
      scheduleCalled = true;
      return jsonResponse({ ...draft, status: "SCHEDULED" });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getByRole } = renderWithClient(
    React.createElement(SchedulePeriodDialog, { period: draft as never }),
  );

  await waitFor(() => assert.ok(getByText("Programar")));
  fireEvent.click(getByText("Programar"));

  const dialog = await waitFor(() => getByRole("dialog"));
  const confirmButton = within(dialog).getByText("Programar");
  assert.equal(scheduleCalled, false);
  fireEvent.click(confirmButton);

  await waitFor(() => assert.equal(scheduleCalled, true));

  tokenManager.clearSession();
});

test("Schedule period — a 409 invalid transition surfaces the Kernel's real detail, never applies locally", async () => {
  const notDraft = period({ id: "prd_sched2", status: "CLOSED" });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse(["kernel.period.update"]);
    if (
      request.method === "POST" &&
      url.pathname === "/api/kernel/v1/periods/prd_sched2/schedule"
    ) {
      return problemResponse(409, "KERNEL_INVALID_TRANSITION", {
        detail: "El período no está en DRAFT.",
      });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  // Force-render via the DRAFT gate off — schedule directly on a DRAFT
  // copy so the dialog is offered, but the Kernel itself rejects it.
  const offeredDraft = { ...notDraft, status: "DRAFT" };
  const { getByText, getByRole } = renderWithClient(
    React.createElement(SchedulePeriodDialog, {
      period: offeredDraft as never,
    }),
  );

  await waitFor(() => assert.ok(getByText("Programar")));
  fireEvent.click(getByText("Programar"));
  const dialog = await waitFor(() => getByRole("dialog"));
  fireEvent.click(within(dialog).getByText("Programar"));

  await waitFor(() =>
    assert.ok(within(dialog).getByText("El período no está en DRAFT.")),
  );
  assert.ok(within(dialog).getByText("Programar período"));

  tokenManager.clearSession();
});

test("Activate period — success: visible only from SCHEDULED, calls activate", async () => {
  const scheduled = period({ id: "prd_act1", status: "SCHEDULED" });
  const backend = new MockBackend();
  let activateCalled = false;
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse(["kernel.period.activate"]);
    if (
      request.method === "POST" &&
      url.pathname === "/api/kernel/v1/periods/prd_act1/activate"
    ) {
      activateCalled = true;
      return jsonResponse({ ...scheduled, status: "ACTIVE" });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getByRole } = renderWithClient(
    React.createElement(ActivatePeriodDialog, { period: scheduled as never }),
  );

  await waitFor(() => assert.ok(getByText("Activar")));
  fireEvent.click(getByText("Activar"));
  const dialog = await waitFor(() => getByRole("dialog"));
  fireEvent.click(within(dialog).getByText("Activar"));

  await waitFor(() => assert.equal(activateCalled, true));

  tokenManager.clearSession();
});

test('Activate period — 409 "two ACTIVE periods" conflict: shows the institutional message, never a raw code', async () => {
  const scheduled = period({ id: "prd_act2", status: "SCHEDULED" });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse(["kernel.period.activate"]);
    if (
      request.method === "POST" &&
      url.pathname === "/api/kernel/v1/periods/prd_act2/activate"
    ) {
      return problemResponse(409, "KERNEL_INVALID_TRANSITION", {
        detail: "Another period is already ACTIVE for this organization.",
      });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getByRole, queryByText } = renderWithClient(
    React.createElement(ActivatePeriodDialog, { period: scheduled as never }),
  );

  await waitFor(() => assert.ok(getByText("Activar")));
  fireEvent.click(getByText("Activar"));
  const dialog = await waitFor(() => getByRole("dialog"));
  fireEvent.click(within(dialog).getByText("Activar"));

  await waitFor(() =>
    assert.ok(
      within(dialog).getByText(
        "No se pudo activar el período: sólo puede activarse desde SCHEDULED y no puede haber otro período ACTIVE en esta organización.",
      ),
    ),
  );
  assert.equal(queryByText(/KERNEL_INVALID_TRANSITION/), null);

  tokenManager.clearSession();
});

test("Cancel period — success: visible from DRAFT/SCHEDULED, calls cancel", async () => {
  const draft = period({ id: "prd_cancel1", status: "DRAFT" });
  const backend = new MockBackend();
  let cancelCalled = false;
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse(["kernel.period.update"]);
    if (
      request.method === "POST" &&
      url.pathname === "/api/kernel/v1/periods/prd_cancel1/cancel"
    ) {
      cancelCalled = true;
      return jsonResponse({ ...draft, status: "CANCELLED" });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getByRole } = renderWithClient(
    React.createElement(CancelPeriodDialog, { period: draft as never }),
  );

  await waitFor(() => assert.ok(getByText("Cancelar período")));
  fireEvent.click(getByText("Cancelar período"));
  const dialog = await waitFor(() => getByRole("dialog"));
  fireEvent.click(
    within(dialog).getByText("Cancelar período", { selector: "button" }),
  );

  await waitFor(() => assert.equal(cancelCalled, true));

  tokenManager.clearSession();
});

test("Cancel period — a 409 invalid transition surfaces the Kernel's real detail", async () => {
  const active = period({ id: "prd_cancel2", status: "ACTIVE" });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse(["kernel.period.update"]);
    if (
      request.method === "POST" &&
      url.pathname === "/api/kernel/v1/periods/prd_cancel2/cancel"
    ) {
      return problemResponse(409, "KERNEL_INVALID_TRANSITION", {
        detail: "ACTIVE period cannot be cancelled.",
      });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  // Cancel is only offered from DRAFT/SCHEDULED — force-offer it here to
  // exercise the Kernel's own rejection of an ACTIVE period.
  const offered = { ...active, status: "DRAFT" };
  const { getByText, getByRole } = renderWithClient(
    React.createElement(CancelPeriodDialog, { period: offered as never }),
  );

  await waitFor(() => assert.ok(getByText("Cancelar período")));
  fireEvent.click(getByText("Cancelar período"));
  const dialog = await waitFor(() => getByRole("dialog"));
  fireEvent.click(
    within(dialog).getByText("Cancelar período", { selector: "button" }),
  );

  await waitFor(() =>
    assert.ok(within(dialog).getByText("ACTIVE period cannot be cancelled.")),
  );

  tokenManager.clearSession();
});

// ---------------------------------------------------------------------------
// Close period — most sensitive action; cross-domain invalidation angle.
// ---------------------------------------------------------------------------

test("Close period — success: calls only closePeriod (no Appointment endpoint), no optimistic status flip, invalidates period + effective-permissions caches", async () => {
  const active = period({
    id: "prd_close1",
    organizationId: "org_close",
    status: "ACTIVE",
    name: "Período a Cerrar",
  });
  let currentPeriod = { ...active };
  const backend = new MockBackend();
  let closeCalled = false;
  let resolveClose: (() => void) | undefined;
  const closeGate = new Promise<void>((resolve) => {
    resolveClose = resolve;
  });

  backend.kernelHandler = async (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse(["kernel.period.close"]);
    if (url.pathname === "/api/kernel/v1/periods/prd_close1") {
      return jsonResponse(currentPeriod);
    }
    if (
      request.method === "POST" &&
      url.pathname === "/api/kernel/v1/periods/prd_close1/close"
    ) {
      closeCalled = true;
      await closeGate;
      currentPeriod = {
        ...currentPeriod,
        status: "CLOSED",
        closedAt: "2026-06-30T00:00:00.000Z",
      };
      return jsonResponse(currentPeriod);
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getAllByText, getByRole } = renderWithClient(
    React.createElement(PeriodDetailContainer, { periodId: "prd_close1" }),
  );

  await waitFor(() => assert.ok(getByText("Activo")));
  const permCallsBeforeClose = backend.kernelCalls.filter((c) =>
    c.url.includes("effective-permissions"),
  ).length;

  await waitFor(() => assert.ok(getByText("Cerrar período")));
  fireEvent.click(getByText("Cerrar período"));
  const dialog = await waitFor(() => getByRole("dialog"));
  fireEvent.click(
    within(dialog).getByText("Cerrar período", { selector: "button" }),
  );

  await waitFor(() => assert.equal(closeCalled, true));

  // Still ACTIVE — the Kernel hasn't confirmed yet (`closeGate` unresolved).
  assert.ok(
    getByText("Activo"),
    "status must not flip before the Kernel actually confirms the close",
  );
  assert.equal(
    backend.kernelCalls.some((c) => c.url.includes("/appointments/")),
    false,
    "closing a period must never call an Appointment endpoint from the frontend",
  );

  resolveClose?.();

  await waitFor(() => assert.ok(getAllByText("Cerrado").length > 0));
  await waitFor(() => {
    const permCallsAfterClose = backend.kernelCalls.filter((c) =>
      c.url.includes("effective-permissions"),
    ).length;
    assert.ok(
      permCallsAfterClose > permCallsBeforeClose,
      "closing a period must invalidate authorizationKeys.allEffectivePermissions()",
    );
  });
  assert.equal(
    backend.kernelCalls.some((c) => c.url.includes("/appointments/")),
    false,
    "still true after the close resolved — no Appointment endpoint was ever called",
  );

  tokenManager.clearSession();
});

test("Close period — a 409 invalid transition (not ACTIVE) surfaces the Kernel's real detail", async () => {
  const draft = period({ id: "prd_close2", status: "ACTIVE" });
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions"))
      return permissionsResponse(["kernel.period.close"]);
    if (
      request.method === "POST" &&
      url.pathname === "/api/kernel/v1/periods/prd_close2/close"
    ) {
      return problemResponse(409, "KERNEL_INVALID_TRANSITION", {
        detail: "El período no está ACTIVE.",
      });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, getByRole } = renderWithClient(
    React.createElement(ClosePeriodDialog, { period: draft as never }),
  );

  await waitFor(() => assert.ok(getByText("Cerrar período")));
  fireEvent.click(getByText("Cerrar período"));
  const dialog = await waitFor(() => getByRole("dialog"));
  fireEvent.click(
    within(dialog).getByText("Cerrar período", { selector: "button" }),
  );

  await waitFor(() =>
    assert.ok(within(dialog).getByText("El período no está ACTIVE.")),
  );

  tokenManager.clearSession();
});
