import assert from "node:assert/strict";
import test from "node:test";

import React from "react";

import { MockBackend } from "./mock-backend.ts";
import { renderWithClient, waitFor } from "./render.ts";

const { tokenManager } = await import("../../src/lib/api/client/token-manager.ts");
const { ClubDashboard } = await import("../../src/features/dashboard/containers/club-dashboard.tsx");
const { DistrictDashboard } = await import("../../src/features/dashboard/containers/district-dashboard.tsx");

const CLUB = { id: "org_club", type: "CLUB", code: "RTC-1", name: "Rotaract Buenos Aires" };
const DISTRICT = { id: "org_district", type: "DISTRICT", code: "D4845", name: "Distrito 4845" };

const POSITIONS = [
  { id: "pos_president", code: "CLUB_PRESIDENT", name: "Presidente" },
  { id: "pos_rdr", code: "DISTRICT_RDR", name: "RDR" },
];

const PERIOD = {
  id: "prd_1",
  organizationId: CLUB.id,
  code: "2025-2026",
  name: "2025-2026",
  sequence: 1,
  startDate: "2025-07-01",
  endDate: "2026-06-30",
  status: "ACTIVE",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("ClubDashboard — success: renders stats, resolves the authority's name through the bounded membership→person lookup", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/periods/current")) return jsonResponse(PERIOD);
    if (url.pathname.endsWith("/memberships") && url.pathname.includes(CLUB.id)) {
      return jsonResponse({
        items: [{ id: "mem_1", organizationId: CLUB.id, personId: "per_1", status: "ACTIVE" }],
        pageInfo: { hasMore: false },
      });
    }
    if (url.pathname.endsWith("/authorities/current")) {
      return jsonResponse([
        {
          id: "app_1",
          organizationId: CLUB.id,
          membershipId: "mem_1",
          membershipOrganizationId: CLUB.id,
          periodId: PERIOD.id,
          positionDefinitionId: "pos_president",
          status: "ACTIVE",
        },
      ]);
    }
    if (url.pathname.endsWith("/position-definitions")) return jsonResponse(POSITIONS);
    if (url.pathname.endsWith("/membership-applications")) return jsonResponse([{ id: "mapp_1" }]);
    if (url.pathname.endsWith("/membership-transfers")) {
      // Both from/to-scoped requests hit this same route; empty either way.
      return jsonResponse([]);
    }
    if (url.pathname.endsWith("/memberships/mem_1")) {
      return jsonResponse({ id: "mem_1", organizationId: CLUB.id, personId: "per_1", status: "ACTIVE" });
    }
    if (url.pathname.endsWith("/persons/per_1")) {
      return jsonResponse({ id: "per_1", firstName: "Ada", lastName: "Lovelace", displayName: "Ada Lovelace" });
    }
    return jsonResponse({ message: "unhandled in test" }, 404);
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText } = renderWithClient(React.createElement(ClubDashboard, { organization: CLUB as never }));

  await waitFor(() => assert.ok(getByText("Rotaract Buenos Aires")));
  await waitFor(() => assert.ok(getByText("Presidente")));
  await waitFor(() => assert.ok(getByText("Ada Lovelace")), { timeout: 3000 });
  assert.ok(getByText("2025-2026"), "period card renders the fetched period, not a placeholder");

  tokenManager.clearSession();
});

test("ClubDashboard — empty: no current authorities renders a DataState empty message, not a blank table", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/periods/current")) return jsonResponse(PERIOD);
    if (url.pathname.endsWith("/memberships")) return jsonResponse({ items: [], pageInfo: { hasMore: false } });
    if (url.pathname.endsWith("/authorities/current")) return jsonResponse([]);
    if (url.pathname.endsWith("/position-definitions")) return jsonResponse(POSITIONS);
    if (url.pathname.endsWith("/membership-applications")) return jsonResponse([]);
    if (url.pathname.endsWith("/membership-transfers")) return jsonResponse([]);
    return jsonResponse({ message: "unhandled in test" }, 404);
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText } = renderWithClient(React.createElement(ClubDashboard, { organization: CLUB as never }));

  await waitFor(() => assert.ok(getByText("Sin autoridades vigentes")));
  await waitFor(() => assert.ok(getByText("Todavía no hay cargos activos registrados en este club.")));

  tokenManager.clearSession();
});

test("ClubDashboard — forbidden: a 403 on authorities shows the institutional message, never \"Error 403\"", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/periods/current")) return jsonResponse(PERIOD);
    if (url.pathname.endsWith("/memberships")) return jsonResponse({ items: [], pageInfo: { hasMore: false } });
    if (url.pathname.endsWith("/authorities/current")) {
      return jsonResponse(
        { type: "about:blank", title: "Forbidden", status: 403, code: "KERNEL_FORBIDDEN", instance: "/test" },
        403,
      );
    }
    if (url.pathname.endsWith("/position-definitions")) return jsonResponse(POSITIONS);
    if (url.pathname.endsWith("/membership-applications")) return jsonResponse([]);
    if (url.pathname.endsWith("/membership-transfers")) return jsonResponse([]);
    return jsonResponse({ message: "unhandled in test" }, 404);
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, queryByText } = renderWithClient(
    React.createElement(ClubDashboard, { organization: CLUB as never }),
  );

  await waitFor(() =>
    assert.ok(getByText("No tenés permisos para ver esta información en esta organización.")),
  );
  assert.equal(queryByText(/error 403/i), null);

  tokenManager.clearSession();
});

test("DistrictDashboard — success: shows child clubs from a single request, never a per-club follow-up call", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/periods/current")) return jsonResponse(PERIOD);
    if (url.pathname.endsWith("/children")) {
      return jsonResponse([
        { id: "club_a", type: "CLUB", code: "RTC-A", name: "Club A", status: "ACTIVE" },
        { id: "club_b", type: "CLUB", code: "RTC-B", name: "Club B", status: "ACTIVE" },
      ]);
    }
    if (url.pathname.endsWith("/authorities/current")) {
      return jsonResponse([
        {
          id: "app_rdr",
          organizationId: DISTRICT.id,
          membershipId: "mem_rdr",
          membershipOrganizationId: "club_a",
          periodId: PERIOD.id,
          positionDefinitionId: "pos_rdr",
          status: "ACTIVE",
        },
      ]);
    }
    if (url.pathname.endsWith("/position-definitions")) return jsonResponse(POSITIONS);
    if (url.pathname.endsWith("/memberships/mem_rdr")) {
      return jsonResponse({ id: "mem_rdr", organizationId: "club_a", personId: "per_rdr", status: "ACTIVE" });
    }
    if (url.pathname.endsWith("/persons/per_rdr")) {
      return jsonResponse({ id: "per_rdr", firstName: "Grace", lastName: "Hopper", displayName: "Grace Hopper" });
    }
    return jsonResponse({ message: "unhandled in test" }, 404);
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText } = renderWithClient(
    React.createElement(DistrictDashboard, { organization: DISTRICT as never }),
  );

  await waitFor(() => assert.ok(getByText("Club A")));
  await waitFor(() => assert.ok(getByText("Club B")));
  await waitFor(() => assert.ok(getByText("RDR")));
  await waitFor(() => assert.ok(getByText("Grace Hopper")), { timeout: 3000 });

  const childCalls = backend.kernelCalls.filter((c) => c.url.includes("/children") || c.url.includes("/organizations/club_"));
  assert.equal(
    childCalls.filter((c) => c.url.includes("/organizations/club_")).length,
    0,
    "child clubs must render from the single /children response, never a follow-up GET per club",
  );

  tokenManager.clearSession();
});
