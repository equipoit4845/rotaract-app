import assert from "node:assert/strict";
import test from "node:test";

import { MockBackend } from "./mock-backend.ts";
import { renderHookWithClient, waitFor } from "./render.ts";

const { tokenManager } = await import("../../src/lib/api/client/token-manager.ts");
const { useCurrentUser } = await import("../../src/lib/api/auth/auth.hooks.ts");
const { useCan } = await import("../../src/lib/api/authorization/authorization.hooks.ts");
const { useActivateAppointment, useEndAppointment } = await import(
  "../../src/lib/api/appointments/appointments.hooks.ts"
);
const { useDeactivateMembership } = await import(
  "../../src/lib/api/memberships/memberships.hooks.ts"
);
const { useCompleteMembershipTransfer } = await import(
  "../../src/lib/api/transfers/transfers.hooks.ts"
);
const { useClosePeriod } = await import("../../src/lib/api/periods/periods.hooks.ts");

const PERMISSION = "kernel.appointment.read";
const ORG_A = "org_a";
const ORG_B = "org_b";

function meResponse() {
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

function permissionsResponse(perms: string[]) {
  return new Response(JSON.stringify(perms), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("activating an appointment grants a permission that useCan reflects without a reload", async () => {
  const backend = new MockBackend();
  const permsByOrg: Record<string, string[]> = { [ORG_A]: [] };
  backend.kernelHandler = (request) => {
    if (request.url.endsWith("/auth/me")) return meResponse();
    if (request.url.includes("/effective-permissions")) {
      const org = new URL(request.url).searchParams.get("organizationId") ?? "";
      return permissionsResponse(permsByOrg[org] ?? []);
    }
    if (request.method === "POST" && request.url.endsWith("/appointments/appt_1/activate")) {
      permsByOrg[ORG_A] = [PERMISSION];
      return new Response(
        JSON.stringify({ id: "appt_1", organizationId: ORG_A, status: "ACTIVE" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    throw new Error(`unexpected call ${request.method} ${request.url}`);
  };

  tokenManager.setSession(backend.issueToken(), 600);
  const { result } = renderHookWithClient(() => {
    useCurrentUser();
    return {
      can: useCan(PERMISSION, { scopeType: "ORGANIZATION", scopeId: ORG_A }),
      activate: useActivateAppointment(),
    };
  });

  await waitFor(() => assert.equal(result.current.can, false));

  await result.current.activate.mutateAsync("appt_1");

  await waitFor(() => assert.equal(result.current.can, true));
  tokenManager.clearSession();
});

test("ending an appointment revokes the permission that useCan reflects without a reload", async () => {
  const backend = new MockBackend();
  const permsByOrg: Record<string, string[]> = { [ORG_A]: [PERMISSION] };
  backend.kernelHandler = (request) => {
    if (request.url.endsWith("/auth/me")) return meResponse();
    if (request.url.includes("/effective-permissions")) {
      const org = new URL(request.url).searchParams.get("organizationId") ?? "";
      return permissionsResponse(permsByOrg[org] ?? []);
    }
    if (request.method === "POST" && request.url.endsWith("/appointments/appt_1/end")) {
      permsByOrg[ORG_A] = [];
      return new Response(JSON.stringify({ id: "appt_1", organizationId: ORG_A, status: "ENDED" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`unexpected call ${request.method} ${request.url}`);
  };

  tokenManager.setSession(backend.issueToken(), 600);
  const { result } = renderHookWithClient(() => {
    useCurrentUser();
    return {
      can: useCan(PERMISSION, { scopeType: "ORGANIZATION", scopeId: ORG_A }),
      end: useEndAppointment(),
    };
  });

  await waitFor(() => assert.equal(result.current.can, true));
  await result.current.end.mutateAsync("appt_1");
  await waitFor(() => assert.equal(result.current.can, false));
  tokenManager.clearSession();
});

test("deactivating a membership updates the contextual permissions useCan reflects without a reload", async () => {
  const backend = new MockBackend();
  const permsByOrg: Record<string, string[]> = { [ORG_A]: [PERMISSION] };
  backend.kernelHandler = (request) => {
    if (request.url.endsWith("/auth/me")) return meResponse();
    if (request.url.includes("/effective-permissions")) {
      const org = new URL(request.url).searchParams.get("organizationId") ?? "";
      return permissionsResponse(permsByOrg[org] ?? []);
    }
    if (request.method === "POST" && request.url.endsWith("/memberships/mem_1/deactivate")) {
      permsByOrg[ORG_A] = [];
      return new Response(
        JSON.stringify({ id: "mem_1", personId: "per_1", organizationId: ORG_A, status: "INACTIVE" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    throw new Error(`unexpected call ${request.method} ${request.url}`);
  };

  tokenManager.setSession(backend.issueToken(), 600);
  const { result } = renderHookWithClient(() => {
    useCurrentUser();
    return {
      can: useCan(PERMISSION, { scopeType: "ORGANIZATION", scopeId: ORG_A }),
      deactivate: useDeactivateMembership(),
    };
  });

  await waitFor(() => assert.equal(result.current.can, true));
  await result.current.deactivate.mutateAsync({ membershipId: "mem_1" });
  await waitFor(() => assert.equal(result.current.can, false));
  tokenManager.clearSession();
});

test("completing a transfer moves effective permissions from the origin scope to the destination scope", async () => {
  const backend = new MockBackend();
  const permsByOrg: Record<string, string[]> = { [ORG_A]: [PERMISSION], [ORG_B]: [] };
  backend.kernelHandler = (request) => {
    if (request.url.endsWith("/auth/me")) return meResponse();
    if (request.url.includes("/effective-permissions")) {
      const org = new URL(request.url).searchParams.get("organizationId") ?? "";
      return permissionsResponse(permsByOrg[org] ?? []);
    }
    if (request.method === "POST" && request.url.endsWith("/membership-transfers/tr_1/complete")) {
      permsByOrg[ORG_A] = [];
      permsByOrg[ORG_B] = [PERMISSION];
      return new Response(
        JSON.stringify({
          id: "tr_1",
          membershipId: "mem_1",
          fromOrganizationId: ORG_A,
          toOrganizationId: ORG_B,
          status: "COMPLETED",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    throw new Error(`unexpected call ${request.method} ${request.url}`);
  };

  tokenManager.setSession(backend.issueToken(), 600);
  const { result } = renderHookWithClient(() => {
    useCurrentUser();
    return {
      canA: useCan(PERMISSION, { scopeType: "ORGANIZATION", scopeId: ORG_A }),
      canB: useCan(PERMISSION, { scopeType: "ORGANIZATION", scopeId: ORG_B }),
      complete: useCompleteMembershipTransfer(),
    };
  });

  await waitFor(() => assert.equal(result.current.canA, true));
  await waitFor(() => assert.equal(result.current.canB, false));

  await result.current.complete.mutateAsync("tr_1");

  await waitFor(() => assert.equal(result.current.canA, false));
  await waitFor(() => assert.equal(result.current.canB, true));
  tokenManager.clearSession();
});

test("closing a period (which ends active appointments in the same transaction) updates effective permissions", async () => {
  const backend = new MockBackend();
  const permsByOrg: Record<string, string[]> = { [ORG_A]: [PERMISSION] };
  backend.kernelHandler = (request) => {
    if (request.url.endsWith("/auth/me")) return meResponse();
    if (request.url.includes("/effective-permissions")) {
      const org = new URL(request.url).searchParams.get("organizationId") ?? "";
      return permissionsResponse(permsByOrg[org] ?? []);
    }
    if (request.method === "POST" && request.url.endsWith("/periods/per_1/close")) {
      permsByOrg[ORG_A] = [];
      return new Response(
        JSON.stringify({ id: "per_1", organizationId: ORG_A, status: "CLOSED" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    throw new Error(`unexpected call ${request.method} ${request.url}`);
  };

  tokenManager.setSession(backend.issueToken(), 600);
  const { result } = renderHookWithClient(() => {
    useCurrentUser();
    return {
      can: useCan(PERMISSION, { scopeType: "ORGANIZATION", scopeId: ORG_A }),
      close: useClosePeriod(),
    };
  });

  await waitFor(() => assert.equal(result.current.can, true));
  await result.current.close.mutateAsync("per_1");
  await waitFor(() => assert.equal(result.current.can, false));
  tokenManager.clearSession();
});
