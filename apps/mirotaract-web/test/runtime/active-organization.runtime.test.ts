import assert from "node:assert/strict";
import test from "node:test";

import { MockBackend } from "./mock-backend.ts";
import { renderHookWithClient, waitFor } from "./render.ts";

const { tokenManager } = await import("../../src/lib/api/client/token-manager.ts");
const { authKeys } = await import("../../src/lib/api/auth/auth.keys.ts");
const { useActiveOrganization } = await import(
  "../../src/lib/api/organizations/use-active-organization.ts"
);

const STORAGE_KEY = "mirotaract.activeOrganizationId";

function userContext(memberships: { organizationId: string; status: string }[]) {
  return {
    accountId: "acc_1",
    personId: "per_1",
    accountStatus: "ACTIVE",
    platformRole: "USER",
    displayName: "Ana",
    memberships: memberships.map((m) => ({
      membershipId: `mem_${m.organizationId}`,
      organizationId: m.organizationId,
      organizationType: "CLUB",
      status: m.status,
    })),
    contextVersion: 1,
  };
}

test("useActiveOrganization falls back deterministically (first ACTIVE membership) once the current selection stops being ACTIVE — e.g. deactivated or transferred out", async () => {
  const backend = new MockBackend();
  let membershipsResponse = [
    { organizationId: "club_a", status: "ACTIVE" },
    { organizationId: "club_b", status: "ACTIVE" },
  ];
  backend.kernelHandler = (request) => {
    if (request.url.endsWith("/auth/me")) {
      return new Response(JSON.stringify(userContext(membershipsResponse)), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    const id = request.url.split("/organizations/")[1];
    return new Response(JSON.stringify({ id, name: `Club ${id}` }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  tokenManager.setSession(backend.issueToken(), 600);
  window.localStorage.setItem(STORAGE_KEY, "club_a");

  const { result, queryClient } = renderHookWithClient(() => useActiveOrganization());

  await waitFor(() => assert.equal(result.current.organizationId, "club_a"));
  await waitFor(() => assert.equal(result.current.organization?.id, "club_a"));

  // club_a's membership is deactivated (equally representative of a
  // completed transfer out of club_a — both remove it from the ACTIVE set).
  membershipsResponse = [
    { organizationId: "club_a", status: "INACTIVE" },
    { organizationId: "club_b", status: "ACTIVE" },
  ];
  await queryClient.invalidateQueries({ queryKey: authKeys.currentUser() });

  await waitFor(() => assert.equal(result.current.organizationId, "club_b"));
  assert.equal(
    window.localStorage.getItem(STORAGE_KEY),
    "club_b",
    "the recovered fallback must be persisted, not just held in memory",
  );
  await waitFor(() => assert.equal(result.current.organization?.id, "club_b"));

  tokenManager.clearSession();
  window.localStorage.removeItem(STORAGE_KEY);
});

test("useActiveOrganization fallback criterion is deterministic: the first ACTIVE membership in UserContext.memberships order, not district-preferred or null", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    if (request.url.endsWith("/auth/me")) {
      return new Response(
        JSON.stringify(
          userContext([
            { organizationId: "club_first", status: "ACTIVE" },
            { organizationId: "district_second", status: "ACTIVE" },
          ]),
        ),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    const id = request.url.split("/organizations/")[1];
    return new Response(JSON.stringify({ id, name: `Org ${id}` }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  tokenManager.setSession(backend.issueToken(), 600);
  window.localStorage.removeItem(STORAGE_KEY);

  const { result } = renderHookWithClient(() => useActiveOrganization());

  await waitFor(() => assert.equal(result.current.organizationId, "club_first"));

  tokenManager.clearSession();
});
