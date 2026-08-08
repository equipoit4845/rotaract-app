import assert from "node:assert/strict";
import { renderHook } from "@testing-library/react";
import test from "node:test";

import { MockBackend } from "./mock-backend.ts";
import { waitFor } from "./render.ts";

const { useAuthStatus } = await import("../../src/lib/api/client/use-auth-status.ts");
const { useCurrentUser } = await import("../../src/lib/api/auth/auth.hooks.ts");
const { authKeys } = await import("../../src/lib/api/auth/auth.keys.ts");
const { useOrganization } = await import("../../src/lib/api/organizations/organizations.hooks.ts");
const { useQueryClient } = await import("@tanstack/react-query");
const { QueryProvider } = await import("../../src/app/providers/query-provider.tsx");

test("a silently expired session (refresh fails on a background 401) clears auth, clears the query cache, and leaves no stale user data visible", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    if (request.url.endsWith("/auth/me")) {
      return new Response(
        JSON.stringify({
          accountId: "acc_1",
          personId: "per_1",
          accountStatus: "ACTIVE",
          platformRole: "USER",
          displayName: "Ana",
          memberships: [],
          contextVersion: 1,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ id: "org_1", name: "Club Norte" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  // No manual tokenManager.setSession here — QueryProvider mounts
  // SessionBootstrap, which establishes the session the same way a real
  // page load would (silent refresh; see session-bootstrap.runtime.test.ts).
  const { result } = renderHook(
    () => ({
      status: useAuthStatus(),
      currentUser: useCurrentUser(),
      org: useOrganization("org_1"),
      queryClient: useQueryClient(),
    }),
    { wrapper: QueryProvider },
  );

  await waitFor(() => assert.equal(result.current.currentUser.isSuccess, true));
  await waitFor(() => assert.equal(result.current.org.isSuccess, true));
  assert.equal(result.current.currentUser.data?.displayName, "Ana");
  assert.equal(
    result.current.queryClient.getQueryCache().getAll().length > 0,
    true,
    "sanity: cache should be populated before expiry",
  );

  // Now the access token (and, unbeknownst to the client, the refresh
  // token) are both no longer valid — the next background request 401s and
  // the refresh that follows fails too.
  backend.currentAccessToken = null;
  backend.refreshValid = false;

  await result.current.org.refetch().catch(() => undefined);

  await waitFor(() => assert.equal(result.current.status, "UNAUTHENTICATED"));

  // `useCurrentUser` is gated on `isAuthenticated` (auth.hooks.ts), so once
  // the session clears it stops being an active observer and its cache
  // entry isn't recreated — unlike e.g. `useOrganization`, which has no
  // such gate and will legitimately keep refetching (and getting fresh
  // error entries) as long as it's mounted. The meaningful invariant is
  // that the *user's* data specifically is gone, not that the whole cache
  // is empty (an actively-mounted, ungated observer will always repopulate
  // some entry — that's normal TanStack Query behavior, not a leak).
  await waitFor(() =>
    assert.equal(
      result.current.queryClient.getQueryData(authKeys.currentUser()),
      undefined,
      "the previous user's cached data must not remain visible after a silent session expiry",
    ),
  );
  assert.equal(result.current.currentUser.data, undefined);
  assert.equal(result.current.currentUser.isSuccess, false);
});
