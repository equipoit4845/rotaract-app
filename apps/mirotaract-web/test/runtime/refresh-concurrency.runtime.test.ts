import assert from "node:assert/strict";
import test from "node:test";

import { MockBackend } from "./mock-backend.ts";
import { renderHookWithClient, waitFor } from "./render.ts";

const { tokenManager } = await import("../../src/lib/api/client/token-manager.ts");
const { useOrganization } = await import("../../src/lib/api/organizations/organizations.hooks.ts");

test("10 concurrent queries with an expired access token trigger exactly 1 refresh, then all 10 retry and succeed", async () => {
  const backend = new MockBackend();
  // The backend has already rotated past whatever token the client is
  // about to present — every one of the 10 initial requests must 401.
  backend.issueToken();
  backend.kernelHandler = (request) => {
    const id = request.url.split("/organizations/")[1];
    return new Response(JSON.stringify({ id, name: `Org ${id}` }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  tokenManager.setSession("stale-token", 600);

  const ids = Array.from({ length: 10 }, (_, i) => `org_${i + 1}`);
  const { result } = renderHookWithClient(() => ids.map((id) => useOrganization(id)));

  await waitFor(() => assert.ok(result.current.every((q) => q.isSuccess)));

  assert.equal(backend.refreshCalls, 1, "10 concurrent 401s must share a single refresh");

  const attempts = backend.kernelCalls.filter((c) => c.auth === "stale-token");
  const retries = backend.kernelCalls.filter((c) => c.auth === backend.currentAccessToken);
  assert.equal(attempts.length, 10);
  assert.equal(retries.length, 10);

  result.current.forEach((q, i) => assert.equal(q.data!.id, ids[i]));

  tokenManager.clearSession();
});
