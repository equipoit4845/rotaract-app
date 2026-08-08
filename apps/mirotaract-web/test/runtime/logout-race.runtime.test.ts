import assert from "node:assert/strict";
import test from "node:test";

import { rawUrl, setFetchHandler } from "./bootstrap.ts";
import { renderHookWithClient, waitFor } from "./render.ts";

const { tokenManager } = await import("../../src/lib/api/client/token-manager.ts");
const { useOrganization } = await import("../../src/lib/api/organizations/organizations.hooks.ts");
const { useLogout } = await import("../../src/lib/api/auth/auth.hooks.ts");

test("logging out (useLogout) while a 401-triggered refresh is in flight leaves the session cleared once that refresh resolves", async () => {
  tokenManager.setSession("stale-token", 600);

  let resolveRefresh: (() => void) | undefined;
  let resolveLogout: (() => void) | undefined;
  const calls: string[] = [];

  setFetchHandler(async (input) => {
    const url = rawUrl(input as string | Request);
    calls.push(url);

    if (url.endsWith("/api/auth/refresh")) {
      return new Promise((resolve) => {
        resolveRefresh = () =>
          resolve(
            new Response(
              JSON.stringify({
                accessToken: "resurrected-token",
                tokenType: "Bearer",
                expiresIn: 600,
              }),
              { status: 200, headers: { "content-type": "application/json" } },
            ),
          );
      });
    }

    if (url.endsWith("/api/auth/logout")) {
      return new Promise((resolve) => {
        resolveLogout = () => resolve(new Response(null, { status: 204 }));
      });
    }

    // Kernel call — always 401 with the stale token to trigger the refresh.
    return new Response(JSON.stringify({ code: "UNAUTHORIZED" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  });

  const { result } = renderHookWithClient(() => ({
    org: useOrganization("org_1"),
    logout: useLogout(),
  }));

  await waitFor(() => assert.ok(calls.some((u) => u.endsWith("/api/auth/refresh"))));
  assert.ok(resolveRefresh, "the 401'd query should have started a refresh");

  // The user clicks logout while that refresh is still pending.
  result.current.logout.mutate();
  await waitFor(() => assert.ok(resolveLogout, "logout's BFF call should be in flight"));
  resolveLogout?.();
  await waitFor(() => assert.equal(result.current.logout.isSuccess, true));
  assert.equal(tokenManager.isAuthenticated(), false, "logout must clear the session immediately");

  // Now the stale refresh (started before logout) finally resolves.
  resolveRefresh?.();
  await new Promise((r) => setTimeout(r, 20));

  assert.equal(
    tokenManager.isAuthenticated(),
    false,
    "a refresh that started before logout must not resurrect the session once it resolves",
  );
  assert.equal(tokenManager.getAccessToken(), null);
});
