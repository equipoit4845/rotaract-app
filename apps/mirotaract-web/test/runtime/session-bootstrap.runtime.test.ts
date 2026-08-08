import assert from "node:assert/strict";
import { render } from "@testing-library/react";
import React from "react";
import test from "node:test";

import { MockBackend } from "./mock-backend.ts";
import { renderHookWithClient, waitFor } from "./render.ts";

const { useAuthStatus } = await import("../../src/lib/api/client/use-auth-status.ts");
const { useCurrentUser } = await import("../../src/lib/api/auth/auth.hooks.ts");
const { SessionBootstrap } = await import("../../src/lib/api/auth/session-bootstrap.tsx");

test("mounting SessionBootstrap resolves BOOTSTRAPPING -> AUTHENTICATED via a silent refresh, and no protected request fires before it resolves", async () => {
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
    throw new Error(`unexpected kernel call ${request.url}`);
  };

  // SessionBootstrap doesn't use TanStack Query itself (just calls
  // refreshManager.refresh() on mount) — it and the hooks below only need
  // to share the same tokenManager singleton, not a React tree.
  const { result } = renderHookWithClient(() => ({
    status: useAuthStatus(),
    currentUser: useCurrentUser(),
  }));
  assert.equal(
    result.current.status,
    "BOOTSTRAPPING",
    "this is the very first read of tokenManager in a fresh process — must be BOOTSTRAPPING, not UNAUTHENTICATED",
  );

  render(React.createElement(SessionBootstrap));

  assert.equal(
    backend.kernelCalls.some((c) => c.url.endsWith("/auth/me")),
    false,
    "no protected request should fire while still bootstrapping",
  );

  await waitFor(() => assert.equal(result.current.status, "AUTHENTICATED"));
  assert.equal(backend.refreshCalls, 1);

  await waitFor(() => assert.equal(result.current.currentUser.isSuccess, true));
  assert.equal(result.current.currentUser.data!.displayName, "Ana");
});
