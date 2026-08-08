import assert from "node:assert/strict";
import test from "node:test";

import { MockBackend } from "./mock-backend.ts";
import { renderHookWithClient, waitFor } from "./render.ts";

const { tokenManager } = await import("../../src/lib/api/client/token-manager.ts");
const { useLogoutAllSessions } = await import("../../src/lib/api/auth/auth.hooks.ts");

test("useLogoutAllSessions clears the local access token, the local session (BFF cookie), and the query cache", async () => {
  const backend = new MockBackend();
  backend.issueToken();
  tokenManager.setSession(backend.currentAccessToken!, 600);

  const { result, queryClient } = renderHookWithClient(() => useLogoutAllSessions());
  queryClient.setQueryData(["probe"], { stale: "user A data" });

  await result.current.mutateAsync();

  assert.equal(backend.logoutAllCalls, 1);
  assert.equal(tokenManager.isAuthenticated(), false, "access token must be cleared");
  assert.equal(tokenManager.getAuthStatus(), "UNAUTHENTICATED");
  assert.equal(
    queryClient.getQueryData(["probe"]),
    undefined,
    "logout-all must clear the query cache, not just the token",
  );

  // The BFF route (session-cookie.server.ts) is responsible for deleting
  // the httpOnly refresh cookie server-side on this same call — verified
  // structurally in kernel-api-consumption-validation.md; this test only
  // covers what the client can observe (it never sees the cookie at all).
});
