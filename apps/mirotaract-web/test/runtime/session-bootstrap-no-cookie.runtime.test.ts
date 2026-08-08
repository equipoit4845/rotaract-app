import assert from "node:assert/strict";
import { render } from "@testing-library/react";
import React from "react";
import test from "node:test";

import { MockBackend } from "./mock-backend.ts";
import { renderHookWithClient, waitFor } from "./render.ts";

const { useAuthStatus } = await import("../../src/lib/api/client/use-auth-status.ts");
const { SessionBootstrap } = await import("../../src/lib/api/auth/session-bootstrap.tsx");

test("mounting SessionBootstrap with no valid refresh cookie resolves BOOTSTRAPPING -> UNAUTHENTICATED, with zero Kernel calls", async () => {
  const backend = new MockBackend();
  backend.refreshValid = false;

  const { result } = renderHookWithClient(() => useAuthStatus());
  assert.equal(result.current, "BOOTSTRAPPING");

  render(React.createElement(SessionBootstrap));

  await waitFor(() => assert.equal(result.current, "UNAUTHENTICATED"));
  assert.equal(backend.refreshCalls, 1);
  assert.equal(backend.kernelCalls.length, 0, "no Kernel call should ever happen with no session");
});
