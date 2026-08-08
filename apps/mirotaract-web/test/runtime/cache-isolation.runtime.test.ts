import assert from "node:assert/strict";
import test from "node:test";

import { MockBackend } from "./mock-backend.ts";
import { renderHookWithClient, waitFor } from "./render.ts";

const { tokenManager } = await import("../../src/lib/api/client/token-manager.ts");
const { useCurrentUser, useLogin, useLogout } = await import(
  "../../src/lib/api/auth/auth.hooks.ts"
);

test("User B never sees User A's cached data after A logs out and B logs in", async () => {
  const backend = new MockBackend();
  let activeDisplayName = "User A";
  backend.kernelHandler = (request) => {
    if (request.url.endsWith("/auth/me")) {
      return new Response(
        JSON.stringify({
          accountId: "acc",
          personId: "per",
          accountStatus: "ACTIVE",
          platformRole: "USER",
          displayName: activeDisplayName,
          memberships: [],
          contextVersion: 1,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    throw new Error(`unexpected call ${request.url}`);
  };

  const { result, queryClient } = renderHookWithClient(() => ({
    currentUser: useCurrentUser(),
    login: useLogin(),
    logout: useLogout(),
  }));

  // User A logs in through the real BFF login flow.
  await result.current.login.mutateAsync({ email: "a@test.com", password: "x" });
  await waitFor(() => assert.equal(result.current.currentUser.data?.displayName, "User A"));
  queryClient.setQueryData(["members", "sensitive-list"], ["A's private roster"]);

  // User A logs out.
  await result.current.logout.mutateAsync();
  assert.equal(tokenManager.isAuthenticated(), false);
  assert.equal(
    queryClient.getQueryData(["members", "sensitive-list"]),
    undefined,
    "logout must wipe every cached entry, not just auth-tagged ones",
  );
  await waitFor(() => assert.equal(result.current.currentUser.data, undefined));

  // User B logs in on the same client/session.
  activeDisplayName = "User B";
  await result.current.login.mutateAsync({ email: "b@test.com", password: "y" });

  await waitFor(() => assert.equal(result.current.currentUser.data?.displayName, "User B"));
  assert.equal(
    queryClient.getQueryData(["members", "sensitive-list"]),
    undefined,
    "User B must never see a leftover cache entry from User A",
  );

  tokenManager.clearSession();
});
