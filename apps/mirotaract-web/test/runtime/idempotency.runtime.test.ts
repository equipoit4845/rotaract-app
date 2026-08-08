import assert from "node:assert/strict";
import test from "node:test";

import { MockBackend } from "./mock-backend.ts";
import { renderHookWithClient, waitFor } from "./render.ts";

const { tokenManager } = await import("../../src/lib/api/client/token-manager.ts");
const { useCreateOrganization } = await import(
  "../../src/lib/api/organizations/organizations.hooks.ts"
);

test("a mutation retried after a 401 refresh reuses the exact same Idempotency-Key and X-Correlation-Id", async () => {
  const backend = new MockBackend();
  backend.issueToken(); // rotate past whatever the client currently holds
  backend.kernelHandler = (request) =>
    new Response(JSON.stringify({ id: "org_new" }), {
      status: 201,
      headers: { "content-type": "application/json" },
    });

  tokenManager.setSession("stale-token", 600);
  const { result } = renderHookWithClient(() => useCreateOrganization());

  await result.current.mutateAsync({ name: "Club Norte", type: "CLUB" } as never);

  const attempts = backend.kernelCalls.filter((c) => c.auth === "stale-token");
  const retries = backend.kernelCalls.filter((c) => c.auth === backend.currentAccessToken);
  assert.equal(attempts.length, 1);
  assert.equal(retries.length, 1);
  assert.equal(backend.refreshCalls, 1);

  assert.ok(attempts[0].idempotencyKey, "the original attempt must carry an Idempotency-Key");
  assert.ok(attempts[0].correlationId, "the original attempt must carry an X-Correlation-Id");
  assert.equal(
    retries[0].idempotencyKey,
    attempts[0].idempotencyKey,
    "the retry must reuse the original Idempotency-Key",
  );
  assert.equal(
    retries[0].correlationId,
    attempts[0].correlationId,
    "the retry must reuse the original X-Correlation-Id",
  );

  tokenManager.clearSession();
});

test("a mutation that hits a real network failure is attempted exactly once and surfaces as KernelApiError (mutations never auto-retry)", async () => {
  const { KernelApiError } = await import("../../src/lib/api/client/api-error.ts");
  const { setFetchHandler } = await import("./bootstrap.ts");

  let attempts = 0;
  setFetchHandler(async () => {
    attempts += 1;
    throw new TypeError("fetch failed");
  });

  tokenManager.setSession("token-x", 600);
  const { result } = renderHookWithClient(() => useCreateOrganization());

  await assert.rejects(
    () => result.current.mutateAsync({ name: "Club Norte", type: "CLUB" } as never),
    (error: unknown) => {
      assert.ok(error instanceof KernelApiError);
      assert.equal(error.code, "NETWORK_ERROR");
      return true;
    },
  );
  assert.equal(attempts, 1, "mutations must not auto-retry a network failure");

  tokenManager.clearSession();
});
