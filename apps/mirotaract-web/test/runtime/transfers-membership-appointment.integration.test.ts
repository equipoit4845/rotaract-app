// bootstrap.ts installs jsdom's globals and must run before
// `@testing-library/react`/react-dom ever get imported — see the same note
// in memberships.runtime.test.ts / persons-memberships.integration.test.ts.
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
  renderWithRouter,
  waitFor,
} from "./render.ts";

afterEach(cleanup);

const { tokenManager } =
  await import("../../src/lib/api/client/token-manager.ts");
const { authorizationKeys } =
  await import("../../src/lib/api/authorization/authorization.keys.ts");
const { appointmentKeys } =
  await import("../../src/lib/api/appointments/appointments.keys.ts");
const { TransferDetailContainer } =
  await import("../../src/features/transfers/containers/transfer-detail-container.tsx");
const { PersonMembershipList } =
  await import("../../src/features/persons/components/person-membership-list.tsx");

function meResponse() {
  return jsonResponse({
    accountId: "acc_1",
    personId: "per_1",
    accountStatus: "ACTIVE",
    platformRole: "USER",
    displayName: "Ada Lovelace",
    memberships: [
      {
        membershipId: "mem_1",
        organizationId: "org_from",
        organizationType: "CLUB",
        status: "ACTIVE",
      },
    ],
    contextVersion: 1,
  });
}

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
  ...ORG_FROM,
  id: "org_to",
  code: "RTC-TO",
  name: "Club Destino",
};

function person() {
  return {
    id: "per_1",
    firstName: "Ada",
    lastName: "Lovelace",
    displayName: "Ada Lovelace",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  };
}

/**
 * Cross-domain test required by the Fase 7+8 integration task (§22/§23):
 * accept (destination) -> confirm (origin) -> complete, driven through the
 * real `TransferDetailContainer` (not individually-mocked dialogs) so each
 * step's permission+scope gate and the resulting status transition are
 * exercised exactly as a user would see them. Verifies: source membership
 * ends up correct, destination membership is created/linked, the person's
 * Membresías tab (Persons feature) refreshes, effective permissions
 * refresh, and completing invalidates Appointments' current-authorities
 * for the origin organization (invariant 6.9.5 — ending incompatible
 * active appointments is part of the same Kernel transaction).
 */
test("Transfer -> Membership -> Appointment: accept -> confirm -> complete moves the membership and invalidates current-authorities for the origin org", async () => {
  let transfer: Record<string, unknown> = {
    id: "trf_1",
    membershipId: "mem_1",
    fromOrganizationId: ORG_FROM.id,
    toOrganizationId: ORG_TO.id,
    requestedById: "per_1",
    status: "REQUESTED",
    reason: null,
    requestedAt: "2025-01-01T00:00:00.000Z",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  };
  let sourceMembership: Record<string, unknown> = {
    id: "mem_1",
    organizationId: ORG_FROM.id,
    personId: "per_1",
    status: "ACTIVE",
    memberNumber: null,
    joinedAt: "2024-01-01T00:00:00.000Z",
    statusChangedAt: "2024-01-01T00:00:00.000Z",
    endedAt: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  };
  let personMemberships: Record<string, unknown>[] = [sourceMembership];

  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();

    if (url.pathname.includes("/effective-permissions")) {
      const orgId = url.searchParams.get("organizationId");
      if (orgId === ORG_TO.id) return jsonResponse(["kernel.transfer.accept"]);
      if (orgId === ORG_FROM.id)
        return jsonResponse(["kernel.transfer.confirm"]);
      return jsonResponse([]);
    }
    if (url.pathname === "/api/kernel/v1/membership-transfers/trf_1") {
      return jsonResponse(transfer);
    }
    if (url.pathname === "/api/kernel/v1/memberships/mem_1") {
      return jsonResponse(sourceMembership);
    }
    if (url.pathname === "/api/kernel/v1/persons/per_1")
      return jsonResponse(person());
    if (url.pathname === "/api/kernel/v1/persons/per_1/memberships") {
      return jsonResponse(personMemberships);
    }
    if (url.pathname === `/api/kernel/v1/organizations/${ORG_FROM.id}`)
      return jsonResponse(ORG_FROM);
    if (url.pathname === `/api/kernel/v1/organizations/${ORG_TO.id}`)
      return jsonResponse(ORG_TO);

    if (
      request.method === "POST" &&
      url.pathname === "/api/kernel/v1/membership-transfers/trf_1/accept"
    ) {
      transfer = {
        ...transfer,
        status: "ACCEPTED_BY_DESTINATION",
        acceptedById: "per_staff",
        acceptedAt: "2025-01-02T00:00:00.000Z",
      };
      return jsonResponse(transfer);
    }
    if (
      request.method === "POST" &&
      url.pathname === "/api/kernel/v1/membership-transfers/trf_1/confirm"
    ) {
      transfer = {
        ...transfer,
        status: "CONFIRMED_BY_ORIGIN",
        confirmedById: "per_staff",
        confirmedAt: "2025-01-03T00:00:00.000Z",
      };
      return jsonResponse(transfer);
    }
    if (
      request.method === "POST" &&
      url.pathname === "/api/kernel/v1/membership-transfers/trf_1/complete"
    ) {
      // Kernel transaction: source -> TRANSFERRED, destination created/reactivated.
      sourceMembership = {
        ...sourceMembership,
        status: "TRANSFERRED",
        endedAt: "2025-01-04T00:00:00.000Z",
      };
      const destinationMembership = {
        id: "mem_dest",
        organizationId: ORG_TO.id,
        personId: "per_1",
        status: "ACTIVE",
        memberNumber: null,
        joinedAt: "2025-01-04T00:00:00.000Z",
        statusChangedAt: "2025-01-04T00:00:00.000Z",
        endedAt: null,
        createdAt: "2025-01-04T00:00:00.000Z",
        updatedAt: "2025-01-04T00:00:00.000Z",
      };
      personMemberships = [sourceMembership, destinationMembership];
      transfer = {
        ...transfer,
        status: "COMPLETED",
        completedAt: "2025-01-04T00:00:00.000Z",
        destinationMembershipId: "mem_dest",
      };
      return jsonResponse(transfer);
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const queryClient = newQueryClient();
  const authoritiesKey = appointmentKeys.currentAuthorities(ORG_FROM.id);
  const appointmentListsKey = appointmentKeys.lists();
  const permissionsKey = authorizationKeys.allEffectivePermissions();
  queryClient.setQueryData(authoritiesKey, "seed");
  queryClient.setQueryData(appointmentListsKey, "seed");
  queryClient.setQueryData(permissionsKey, "seed");

  const { getByText, getAllByText, getByRole } = renderWithRouter(
    React.createElement(React.Fragment, null, [
      React.createElement(TransferDetailContainer, {
        key: "detail",
        transferId: "trf_1",
      }),
      React.createElement(PersonMembershipList, {
        key: "list",
        personId: "per_1",
      }),
    ]),
    { queryClient },
  );

  // Step: source ACTIVE, transfer REQUESTED — only "Aceptar" is offered.
  await waitFor(() => assert.ok(getByText("Aceptar")));
  assert.equal(document.querySelectorAll('[type="button"]').length > 0, true);

  // Step: destination accepts.
  fireEvent.click(getByText("Aceptar"));
  let dialog = await waitFor(() => getByRole("dialog"));
  fireEvent.click(within(dialog).getByText("Aceptar"));
  await waitFor(() =>
    assert.ok(getAllByText("Aceptada por destino").length > 0),
  );

  // Step: origin confirms.
  await waitFor(() => assert.ok(getByText("Confirmar")));
  fireEvent.click(getByText("Confirmar"));
  dialog = await waitFor(() => getByRole("dialog"));
  fireEvent.click(within(dialog).getByText("Confirmar"));
  await waitFor(() =>
    assert.ok(getAllByText("Confirmada por origen").length > 0),
  );

  // Step: complete.
  await waitFor(() => assert.ok(getByText("Completar")));
  fireEvent.click(getByText("Completar"));
  dialog = await waitFor(() => getByRole("dialog"));
  fireEvent.click(within(dialog).getByText("Completar"));

  // Source membership ends up TRANSFERRED, destination membership shows up
  // ACTIVE in the person's Membresías tab — both from the same transaction,
  // reflected without any manual mutation from these components.
  await waitFor(() => assert.ok(getAllByText("Completada").length > 0));
  await waitFor(() => assert.ok(getAllByText("Transferida").length > 0));
  await waitFor(() => assert.ok(getAllByText("Activa").length > 0));

  // Appointments' current-authorities cache for the ORIGIN organization is
  // invalidated (invariant 6.9.5 — incompatible active appointments end as
  // part of the same transaction).
  await waitFor(() =>
    assert.equal(
      queryClient.getQueryState(authoritiesKey as unknown as readonly unknown[])
        ?.isInvalidated,
      true,
    ),
  );
  assert.equal(
    queryClient.getQueryState(
      appointmentListsKey as unknown as readonly unknown[],
    )?.isInvalidated,
    true,
  );
  assert.equal(
    queryClient.getQueryState(permissionsKey as unknown as readonly unknown[])
      ?.isInvalidated,
    true,
  );

  // No manual Membership/Appointment mutation was ever issued — only the
  // three real transfer-lifecycle endpoints.
  const mutationCalls = backend.kernelCalls
    .filter((c) => c.method === "POST")
    .map((c) => c.url);
  assert.equal(mutationCalls.length, 3);
  assert.ok(
    mutationCalls.every((u) => u.includes("/membership-transfers/trf_1/")),
  );
  assert.ok(
    !mutationCalls.some(
      (u) => u.includes("/memberships/") && !u.includes("membership-transfers"),
    ),
  );
  assert.ok(!mutationCalls.some((u) => u.includes("/appointments/")));

  tokenManager.clearSession();
});
