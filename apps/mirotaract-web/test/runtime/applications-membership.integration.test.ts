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
  renderWithClient,
  waitFor,
} from "./render.ts";

afterEach(cleanup);

const { tokenManager } =
  await import("../../src/lib/api/client/token-manager.ts");
const { authorizationKeys } =
  await import("../../src/lib/api/authorization/authorization.keys.ts");
const { membershipKeys } =
  await import("../../src/lib/api/memberships/memberships.keys.ts");
const { ApproveApplicationDialog } =
  await import("../../src/features/applications/forms/approve-application-dialog.tsx");
const { PersonMembershipList } =
  await import("../../src/features/persons/components/person-membership-list.tsx");

function meResponse() {
  return jsonResponse({
    accountId: "acc_1",
    personId: "per_review",
    accountStatus: "ACTIVE",
    platformRole: "USER",
    displayName: "Reviewer",
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

/**
 * Cross-domain test required by the Fase 7+8 integration task (§11):
 * 1. Application SUBMITTED
 * 2. approve
 * 3. Application changes status
 * 4. Membership appears/reactivates
 * 5. person memberships updates
 * 6. organization memberships cache invalidated
 * 7. no manual Membership mutation from the component
 */
test("Application -> Membership: approving reactivates the applicant's INACTIVE membership, refreshes their Membresías tab, and calls only the approve endpoint", async () => {
  // Starts INACTIVE — approving an application can *reactivate* an existing
  // membership, not just create one from scratch (invariant 6.8.3).
  let personMemberships: Record<string, unknown>[] = [
    {
      id: "mem_1",
      organizationId: ORG.id,
      personId: "per_1",
      status: "INACTIVE",
      memberNumber: null,
      joinedAt: "2024-01-01T00:00:00.000Z",
      statusChangedAt: "2024-06-01T00:00:00.000Z",
      endedAt: "2024-06-01T00:00:00.000Z",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-06-01T00:00:00.000Z",
    },
  ];

  const application = {
    id: "app_1",
    organizationId: ORG.id,
    requesterPersonId: "per_1",
    membershipId: null,
    status: "SUBMITTED",
    message: null,
    submittedAt: "2025-01-01T00:00:00.000Z",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  };

  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return meResponse();
    if (url.pathname.includes("/effective-permissions")) {
      return permissionsResponse(["kernel.application.review"]);
    }
    if (url.pathname === "/api/kernel/v1/persons/per_1")
      return jsonResponse(person());
    if (url.pathname === "/api/kernel/v1/persons/per_1/memberships") {
      return jsonResponse(personMemberships);
    }
    if (
      request.method === "POST" &&
      url.pathname === "/api/kernel/v1/membership-applications/app_1/approve"
    ) {
      personMemberships = personMemberships.map((m) =>
        m.id === "mem_1" ? { ...m, status: "ACTIVE", endedAt: null } : m,
      );
      return jsonResponse({
        ...application,
        status: "APPROVED",
        membershipId: "mem_1",
        reviewedAt: "2025-02-01T00:00:00.000Z",
      });
    }
    return problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);

  const queryClient = newQueryClient();
  const orgListsKey = membershipKeys.organizationLists();
  const permissionsKey = authorizationKeys.allEffectivePermissions();
  queryClient.setQueryData(orgListsKey, "seed");
  queryClient.setQueryData(permissionsKey, "seed");

  const { getByText, getAllByText, getByRole } = renderWithClient(
    React.createElement(React.Fragment, null, [
      React.createElement(ApproveApplicationDialog, {
        key: "approve",
        application: application as never,
        personLabel: "Ada Lovelace",
      }),
      React.createElement(PersonMembershipList, {
        key: "list",
        personId: "per_1",
      }),
    ]),
    { queryClient },
  );

  // Step 1: starts INACTIVE.
  await waitFor(() => assert.ok(getAllByText("Inactiva").length > 0));

  // Step 2: approve.
  fireEvent.click(getByText("Aprobar"));
  const dialog = await waitFor(() => getByRole("dialog"));
  fireEvent.click(within(dialog).getByText("Aprobar"));

  // Step 3/4/5: the Membresías tab (Person feature, reading the same public
  // `usePersonMemberships` the Membership mutation already invalidates)
  // reflects the reactivation without any manual cache write from this
  // component.
  await waitFor(() => assert.ok(getAllByText("Activa").length > 0));

  // Step 6: organization-scoped membership lists are invalidated too (a
  // Memberships-list screen for this organization would refetch).
  await waitFor(() =>
    assert.equal(
      queryClient.getQueryState(orgListsKey as unknown as readonly unknown[])
        ?.isInvalidated,
      true,
    ),
  );
  assert.equal(
    queryClient.getQueryState(permissionsKey as unknown as readonly unknown[])
      ?.isInvalidated,
    true,
    "approving an application can change the applicant's effective permissions in that organization",
  );

  // Step 7: the ONLY mutation call made anywhere in this flow is the
  // approve endpoint itself — never a direct Membership mutation
  // (activate/reactivate/create) issued from the component.
  const mutationCalls = backend.kernelCalls.filter((c) => c.method === "POST");
  assert.equal(mutationCalls.length, 1);
  assert.ok(
    mutationCalls[0].url.endsWith("/membership-applications/app_1/approve"),
  );

  tokenManager.clearSession();
});
