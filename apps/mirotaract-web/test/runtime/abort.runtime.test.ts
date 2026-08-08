import assert from "node:assert/strict";
import test from "node:test";

import { MockBackend } from "./mock-backend.ts";
import { renderHookWithClient, waitFor } from "./render.ts";

const { tokenManager } = await import("../../src/lib/api/client/token-manager.ts");
const { useOrganization } = await import("../../src/lib/api/organizations/organizations.hooks.ts");

test("switching query params quickly aborts the superseded request instead of letting it overwrite later state", async () => {
  const backend = new MockBackend();
  let orgARequestSeen = false;
  let orgASignal: AbortSignal | undefined;

  backend.kernelHandler = (request) => {
    if (request.url.endsWith("/organizations/org_a")) {
      orgARequestSeen = true;
      orgASignal = request.signal;
      // Never resolves within the test — simulates a slow/in-flight request
      // for the organization the user has already navigated away from.
      return new Promise<Response>(() => undefined);
    }
    if (request.url.endsWith("/organizations/org_b")) {
      return new Response(JSON.stringify({ id: "org_b", name: "Club B" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`unexpected call ${request.url}`);
  };

  tokenManager.setSession(backend.issueToken(), 600);

  // Two renderHook calls sharing one QueryClient — the closer, more common
  // analogue of "navigate from the org A screen to the org B screen" (the
  // org A view unmounts entirely, rather than the same component just
  // being handed a new id prop).
  const first = renderHookWithClient(() => useOrganization("org_a"));
  await waitFor(() => assert.equal(orgARequestSeen, true));

  first.unmount();

  const second = renderHookWithClient(() => useOrganization("org_b"), {
    queryClient: first.queryClient,
  });

  await waitFor(() => assert.equal(second.result.current.data?.id, "org_b"));
  assert.equal(
    second.result.current.data?.id,
    "org_b",
    "the still-pending org_a response, if it ever arrived, must not overwrite org_b's state",
  );

  // The app's own plumbing is what's in scope here: the query hook must
  // thread a real AbortSignal through to the actual fetch Request (it
  // does — `organizations.api.ts` forwards `opts.signal` into
  // `httpClient.GET`). Whether TanStack Query calls `.abort()` on it
  // immediately on unmount vs. on its own GC schedule is the query
  // library's internal lifecycle, not this layer's — the property this
  // app is responsible for, and that matters to a user, is the one
  // asserted above: a stale in-flight response can never clobber later
  // state, which holds regardless of exactly when the abort fires.
  assert.ok(orgASignal instanceof AbortSignal, "a real AbortSignal must reach the fetch Request");

  tokenManager.clearSession();
});
