import assert from "node:assert/strict";
import test from "node:test";

import { MockBackend } from "./mock-backend.ts";
import { renderHookWithClient, waitFor } from "./render.ts";

// Deliberately the ONLY import from the app's API layer in this file — the
// public barrel. If any of these hooks weren't actually exported from
// `@/lib/api`, or a component needed `client/*`/`*.api.ts`/`schema.ts` to
// build a real screen, this import would fail to resolve or the hooks
// below would be missing.
const {
  useCurrentUser,
  useActiveOrganization,
  useOrganizations,
  useOrganizationMemberships,
  useCurrentAuthorities,
  useCan,
} = await import("../../src/lib/api/index.ts");

const { tokenManager } = await import("../../src/lib/api/client/token-manager.ts");

test("a screen built only from the public @/lib/api barrel — useCurrentUser, useActiveOrganization, useOrganizations, useOrganizationMemberships, useCurrentAuthorities, useCan — renders and resolves real data end to end", async () => {
  const backend = new MockBackend();
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) {
      return new Response(
        JSON.stringify({
          accountId: "acc_1",
          personId: "per_1",
          accountStatus: "ACTIVE",
          platformRole: "USER",
          displayName: "Ana",
          memberships: [{ membershipId: "mem_1", organizationId: "org_1", organizationType: "CLUB", status: "ACTIVE" }],
          contextVersion: 1,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.pathname.endsWith("/organizations/org_1/memberships")) {
      return new Response(
        JSON.stringify({ items: [{ id: "mem_1", personId: "per_1", status: "ACTIVE" }], pageInfo: { hasMore: false, nextCursor: null } }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.pathname.endsWith("/organizations/org_1/authorities/current")) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.pathname.endsWith("/organizations/org_1")) {
      return new Response(JSON.stringify({ id: "org_1", name: "Club Norte" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.pathname.endsWith("/organizations")) {
      return new Response(
        JSON.stringify({ items: [{ id: "org_1", name: "Club Norte" }], pageInfo: { hasMore: false, nextCursor: null } }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.pathname.includes("/effective-permissions")) {
      return new Response(JSON.stringify(["kernel.membership.read"]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`unexpected call ${request.method} ${url.pathname}`);
  };

  tokenManager.setSession(backend.issueToken(), 600);
  window.localStorage.removeItem("mirotaract.activeOrganizationId");

  const { result } = renderHookWithClient(() => {
    const currentUser = useCurrentUser();
    const active = useActiveOrganization();
    const organizations = useOrganizations();
    const members = useOrganizationMemberships(active.organizationId);
    const authorities = useCurrentAuthorities(active.organizationId);
    const canReadMembers = useCan("kernel.membership.read", {
      scopeType: "ORGANIZATION",
      scopeId: active.organizationId,
    });
    return { currentUser, active, organizations, members, authorities, canReadMembers };
  });

  await waitFor(() => assert.equal(result.current.currentUser.isSuccess, true));
  await waitFor(() => assert.equal(result.current.active.organizationId, "org_1"));
  await waitFor(() => assert.equal(result.current.organizations.isSuccess, true));
  await waitFor(() => assert.equal(result.current.members.isSuccess, true));
  await waitFor(() => assert.equal(result.current.authorities.isSuccess, true));
  await waitFor(() => assert.equal(result.current.canReadMembers, true));

  assert.equal(result.current.active.organization?.name, "Club Norte");
  assert.equal(result.current.members.data?.pages[0]?.items?.[0]?.id, "mem_1");
  assert.deepEqual(result.current.authorities.data, []);

  tokenManager.clearSession();
  window.localStorage.removeItem("mirotaract.activeOrganizationId");
});
