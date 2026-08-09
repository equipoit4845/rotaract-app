import assert from "node:assert/strict";
import test from "node:test";

import { MockBackend } from "./mock-backend.ts";
import { renderHookWithClient, waitFor } from "./render.ts";

const { tokenManager } = await import("../../src/lib/api/client/token-manager.ts");
const { useOrganizationMemberships } = await import(
  "../../src/lib/api/memberships/memberships.hooks.ts"
);

test("useOrganizationMemberships caches are isolated per organization and per status filter — no cross-contamination", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    const orgId = url.pathname.split("/organizations/")[1]?.split("/")[0];
    const statuses = url.searchParams.getAll("status");
    return new Response(
      JSON.stringify({
        items: [{ id: `${orgId}-${statuses.join(",") || "ALL"}` }],
        pageInfo: { hasMore: false, nextCursor: null },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  tokenManager.setSession(backend.issueToken(), 600);
  const { result } = renderHookWithClient(() => ({
    orgAActive: useOrganizationMemberships("org_a", { status: ["ACTIVE"] }),
    orgAOnLeave: useOrganizationMemberships("org_a", { status: ["ON_LEAVE"] }),
    orgBActive: useOrganizationMemberships("org_b", { status: ["ACTIVE"] }),
  }));

  await waitFor(() =>
    assert.ok(
      result.current.orgAActive.isSuccess &&
        result.current.orgAOnLeave.isSuccess &&
        result.current.orgBActive.isSuccess,
    ),
  );

  assert.equal(
    result.current.orgAActive.data?.pages[0]?.items?.[0]?.id,
    "org_a-ACTIVE",
  );
  assert.equal(
    result.current.orgAOnLeave.data?.pages[0]?.items?.[0]?.id,
    "org_a-ON_LEAVE",
  );
  assert.equal(
    result.current.orgBActive.data?.pages[0]?.items?.[0]?.id,
    "org_b-ACTIVE",
  );

  const kernelRequests = backend.kernelCalls.filter((c) => c.url.includes("/memberships"));
  assert.equal(kernelRequests.length, 3, "three distinct query keys must mean three distinct requests, not a shared/collided cache entry");

  tokenManager.clearSession();
});
