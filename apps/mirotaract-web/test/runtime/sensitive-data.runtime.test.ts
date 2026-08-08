import assert from "node:assert/strict";
import test from "node:test";

import { MockBackend } from "./mock-backend.ts";
import { renderHookWithClient, waitFor } from "./render.ts";

const { tokenManager } = await import("../../src/lib/api/client/token-manager.ts");
const { useLogin, useCurrentUser } = await import("../../src/lib/api/auth/auth.hooks.ts");
const { useActiveOrganization } = await import(
  "../../src/lib/api/organizations/use-active-organization.ts"
);

test("after a full login -> browse -> select-organization runtime cycle, nothing token-shaped ever lands in localStorage, sessionStorage, or JS-readable cookies", async () => {
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
          memberships: [
            { membershipId: "mem_1", organizationId: "org_1", organizationType: "CLUB", status: "ACTIVE" },
          ],
          contextVersion: 1,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    throw new Error(`unexpected call ${request.url}`);
  };

  const { result } = renderHookWithClient(() => ({
    login: useLogin(),
    currentUser: useCurrentUser(),
    active: useActiveOrganization(),
  }));

  await result.current.login.mutateAsync({ email: "ana@test.com", password: "secret-password" });
  await waitFor(() => assert.equal(result.current.currentUser.isSuccess, true));
  await waitFor(() => assert.equal(result.current.active.organizationId, "org_1"));

  const lsEntries = Object.entries(window.localStorage).length
    ? Object.keys(window.localStorage)
    : Array.from({ length: window.localStorage.length }, (_, i) => window.localStorage.key(i) as string);

  for (const key of lsEntries) {
    const value = window.localStorage.getItem(key) ?? "";
    assert.doesNotMatch(key.toLowerCase(), /token|secret|password|refresh/);
    assert.doesNotMatch(value, new RegExp(backend.currentAccessToken!));
    assert.doesNotMatch(value.toLowerCase(), /secret-password/);
  }
  // The one legitimate localStorage entry is the non-sensitive active-org id.
  assert.equal(window.localStorage.getItem("mirotaract.activeOrganizationId"), "org_1");

  assert.equal(
    window.sessionStorage.length,
    0,
    "this app never uses sessionStorage for anything (token-manager.ts keeps the access token in memory only)",
  );

  // The refresh token is never something browser JS can read at all — it's
  // set by a server-only Route Handler as httpOnly (session-cookie.server.ts)
  // and this test's mock fetch never touches document.cookie in the first
  // place, so there's nothing here for JS to read either way.
  assert.equal(document.cookie, "");

  tokenManager.clearSession();
  window.localStorage.removeItem("mirotaract.activeOrganizationId");
});
