import assert from "node:assert/strict";
import test from "node:test";

import { MockBackend } from "./mock-backend.ts";
import { renderHookWithClient, waitFor } from "./render.ts";

const { tokenManager } = await import("../../src/lib/api/client/token-manager.ts");
const { useMembership, useActivateMembership } = await import(
  "../../src/lib/api/memberships/memberships.hooks.ts"
);
const { KernelApiError } = await import("../../src/lib/api/client/api-error.ts");

test("a 409 KERNEL_INVALID_TRANSITION on a mutation fails cleanly: previous cache is preserved, no retry, and the domain error code is available to the UI", async () => {
  const backend = new MockBackend();
  let activateAttempts = 0;
  backend.kernelHandler = (request) => {
    if (request.method === "GET" && request.url.endsWith("/memberships/mem_1")) {
      return new Response(
        JSON.stringify({ id: "mem_1", personId: "per_1", organizationId: "org_1", status: "GRADUATED" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (request.method === "POST" && request.url.endsWith("/memberships/mem_1/activate")) {
      activateAttempts += 1;
      return new Response(
        JSON.stringify({
          type: "about:blank",
          title: "Invalid state transition",
          status: 409,
          code: "KERNEL_INVALID_TRANSITION",
          detail: "GRADUATED membership cannot transition directly to ACTIVE",
          instance: "/memberships/mem_1/status",
        }),
        { status: 409, headers: { "content-type": "application/problem+json" } },
      );
    }
    throw new Error(`unexpected call ${request.method} ${request.url}`);
  };

  tokenManager.setSession(backend.issueToken(), 600);
  const { result } = renderHookWithClient(() => ({
    membership: useMembership("mem_1"),
    activate: useActivateMembership(),
  }));

  await waitFor(() => assert.equal(result.current.membership.isSuccess, true));
  const cachedBefore = result.current.membership.data;

  await assert.rejects(
    () => result.current.activate.mutateAsync({ membershipId: "mem_1" }),
    (error: unknown) => {
      assert.ok(error instanceof KernelApiError);
      assert.equal(error.code, "KERNEL_INVALID_TRANSITION");
      assert.equal(error.isInvalidTransition, true);
      assert.equal(error.status, 409);
      return true;
    },
  );

  // No optimistic write happened, and the previously-cached membership is untouched.
  assert.deepEqual(result.current.membership.data, cachedBefore);
  assert.equal(result.current.membership.data?.status, "GRADUATED");

  // Mutations have retry:false — a single failed POST, never retried automatically.
  assert.equal(activateAttempts, 1);

  tokenManager.clearSession();
});
