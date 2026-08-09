// bootstrap.ts installs jsdom's globals and must run before
// `@testing-library/react`/react-dom ever get imported — see
// organizations.runtime.test.ts for the full explanation.
import "./bootstrap.ts";

import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import { cleanup } from "@testing-library/react";

import { MockBackend } from "./mock-backend.ts";
import { renderHookWithClient, waitFor } from "./render.ts";

afterEach(cleanup);

/**
 * Coordinator-owned cross-domain test (product spec §25): Fase 5
 * (Autoridades/Cargos) and Fase 6 (Períodos) were built by two parallel
 * agents, each forbidden from importing the other's `features/**`
 * folder — so neither could write a test spanning both domains from
 * inside their own feature. This lives at the top level, consuming only
 * the shared public `@/lib/api` hooks both features are built on, and
 * proves the actual cross-domain contract:
 *
 * 1. an ACTIVE period has an ACTIVE appointment linked to it;
 * 2. `useClosePeriod()` (Fase 6's own hook) is called — never any
 *    Appointment mutation;
 * 3. the Kernel's mocked response for `POST /periods/{id}/close` is what
 *    ends the appointment (a same-transaction side effect the real
 *    Kernel guarantees per kernel-spec.md invariant 6.5.8 / CA-PER-04 —
 *    this test only asserts the frontend behaves correctly given that
 *    contract, it doesn't re-verify the Kernel's own transaction);
 * 4. `useCurrentAuthorities()` (Fase 5's own hook) reflects the change
 *    afterward without a manual refetch/reload, proving
 *    `usePeriodTransitionMutation`'s invalidation of
 *    `appointmentKeys.currentAuthorities(organizationId)` (in
 *    `src/lib/api/periods/periods.hooks.ts`, shared public layer) is
 *    real;
 * 5. no `POST .../appointments/*\/end` (or any other Appointment mutation
 *    endpoint) is ever called by the frontend — the cascading end is
 *    the Kernel's job, not the UI's (product spec §24: "no inventar
 *    efectos... Frontend NO llama manualmente endAppointment").
 */

const { tokenManager } =
  await import("../../src/lib/api/client/token-manager.ts");
const { useClosePeriod } =
  await import("../../src/lib/api/periods/periods.hooks.ts");
const { useCurrentAuthorities } =
  await import("../../src/lib/api/appointments/appointments.hooks.ts");
const { useCurrentUser } = await import("../../src/lib/api/auth/auth.hooks.ts");
const { useCan } =
  await import("../../src/lib/api/authorization/authorization.hooks.ts");

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
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

const ORG = "org_club1";
const PERIOD_ID = "prd_integration1";
const APPOINTMENT = {
  id: "app_integration1",
  organizationId: ORG,
  membershipId: "mem_1",
  membershipOrganizationId: ORG,
  periodId: PERIOD_ID,
  positionDefinitionId: "pos_president",
  status: "ACTIVE",
};

test("Period ↔ Appointment integration: closing an ACTIVE period ends its active appointments and refreshes current authorities + effective permissions, without the frontend calling endAppointment", async () => {
  const backend = new MockBackend();
  let periodStatus: "ACTIVE" | "CLOSED" = "ACTIVE";
  let appointmentStatus: "ACTIVE" | "ENDED" = "ACTIVE";
  let closeCalls = 0;
  let manualAppointmentMutationCalls = 0;
  let permissionsFetchCount = 0;

  backend.kernelHandler = (request) => {
    const url = new URL(request.url);

    if (url.pathname.endsWith("/auth/me")) return meResponse();

    if (url.pathname.includes("/effective-permissions")) {
      permissionsFetchCount += 1;
      // Effective permissions are derived from having an ACTIVE appointment
      // — once the Kernel ends it as part of closing the period, this
      // permission should stop being granted, same shape as the
      // already-covered case in permission-invalidation.runtime.test.ts.
      return jsonResponse(
        appointmentStatus === "ACTIVE" ? ["kernel.appointment.read"] : [],
      );
    }

    if (
      url.pathname === `/api/kernel/v1/organizations/${ORG}/authorities/current`
    ) {
      return jsonResponse(
        appointmentStatus === "ACTIVE" ? [{ ...APPOINTMENT }] : [],
      );
    }

    if (
      request.method === "POST" &&
      url.pathname.endsWith(`/periods/${PERIOD_ID}/close`)
    ) {
      closeCalls += 1;
      // This is the ONLY place `appointmentStatus` flips — modeling the
      // Kernel's own transactional side effect (CA-PER-04), never a
      // frontend-initiated Appointment mutation.
      periodStatus = "CLOSED";
      appointmentStatus = "ENDED";
      return jsonResponse({
        id: PERIOD_ID,
        organizationId: ORG,
        code: "2025-2026",
        name: "2025-2026",
        sequence: 1,
        startDate: "2025-07-01",
        endDate: "2026-06-30",
        status: periodStatus,
      });
    }

    // Any direct Appointment mutation (end/activate/revoke/mark-elected)
    // — the frontend must never call these as a side effect of closing a
    // period.
    if (
      request.method === "POST" &&
      /\/appointments\/[^/]+\/(end|activate|revoke|mark-elected)$/.test(
        url.pathname,
      )
    ) {
      manualAppointmentMutationCalls += 1;
      return jsonResponse({ ...APPOINTMENT, status: "ENDED" });
    }

    return jsonResponse(
      { message: "unhandled in test", url: url.pathname },
      404,
    );
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const { result } = renderHookWithClient(() => {
    useCurrentUser();
    return {
      close: useClosePeriod(),
      authorities: useCurrentAuthorities(ORG),
      canReadAppointments: useCan("kernel.appointment.read", {
        scopeType: "ORGANIZATION",
        scopeId: ORG,
      }),
    };
  });

  // 1 & before-state: the period is ACTIVE with an ACTIVE appointment linked to it.
  await waitFor(() => assert.equal(result.current.authorities.data?.length, 1));
  assert.equal(result.current.authorities.data?.[0]?.status, "ACTIVE");
  await waitFor(() => assert.equal(result.current.canReadAppointments, true));

  // 2 & 3: close the period — the ONLY mutation the frontend calls.
  const closed = await result.current.close.mutateAsync(PERIOD_ID);
  assert.equal(closed.status, "CLOSED");
  assert.equal(closeCalls, 1);

  // 4: current authorities reflects the Kernel's transactional side effect
  // without a manual refetch/reload — proving the real invalidation wired
  // into `usePeriodTransitionMutation` (`src/lib/api/periods/periods.hooks.ts`).
  await waitFor(() => assert.equal(result.current.authorities.data?.length, 0));

  // 5: no direct Appointment mutation was ever called by the frontend.
  assert.equal(
    manualAppointmentMutationCalls,
    0,
    "the frontend must never call an Appointment mutation (end/activate/revoke/mark-elected) as a side effect of closing a period — the Kernel ends appointments transactionally inside closePeriod itself",
  );

  // 8: effective permissions reflect the change too (refetched, not just
  // the current-authorities list).
  await waitFor(() => assert.equal(result.current.canReadAppointments, false));
  assert.ok(
    permissionsFetchCount >= 2,
    "effective permissions must be refetched after close (authorizationKeys.allEffectivePermissions() invalidation), not just read once and cached forever",
  );

  tokenManager.clearSession();
});
