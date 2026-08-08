import assert from "node:assert/strict";
import test from "node:test";

let currentFetch = () => {
  throw new Error("no fetch handler installed for this test");
};
globalThis.fetch = (...args) => currentFetch(...args);

const { tokenManager } = await import("../src/lib/api/client/token-manager.ts");
const { refreshManager } =
  await import("../src/lib/api/client/refresh-manager.ts");

test("logout while a refresh is in flight must not resurrect the session once the stale refresh resolves", async () => {
  tokenManager.setSession("old-token", 600);

  let resolveRefresh;
  currentFetch = () =>
    new Promise((resolve) => {
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

  const refreshPromise = refreshManager.refresh();

  // The user logs out while the refresh above is still pending.
  tokenManager.clearSession();
  assert.equal(tokenManager.isAuthenticated(), false);

  // The stale refresh now resolves successfully.
  resolveRefresh();
  await refreshPromise;

  assert.equal(
    tokenManager.isAuthenticated(),
    false,
    "a refresh that started before logout must not resurrect the session after it resolves",
  );
  assert.equal(tokenManager.getAccessToken(), null);
});
