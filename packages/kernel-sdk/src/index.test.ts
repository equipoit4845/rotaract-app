import assert from "node:assert/strict";
import { test } from "node:test";

import { KernelClient } from "./index.ts";

function fakeFetch(
  handler: (
    url: string,
    init?: RequestInit,
  ) => { status: number; body: unknown },
): typeof globalThis.fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const { status, body } = handler(url, init);
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof globalThis.fetch;
}

test("version() calls GET /version with no auth header", async () => {
  let seenUrl = "";
  let seenHeaders: HeadersInit | undefined;
  const client = new KernelClient({
    baseUrl: "http://kernel.test/api/kernel/v1",
    fetch: fakeFetch((url, init) => {
      seenUrl = url;
      seenHeaders = init?.headers;
      return { status: 200, body: { service: "kernel", version: "1.0.0" } };
    }),
  });

  const result = await client.version();

  assert.equal(seenUrl, "http://kernel.test/api/kernel/v1/version");
  assert.deepEqual(seenHeaders, {});
  assert.deepEqual(result, { service: "kernel", version: "1.0.0" });
});

test("getUserContext() sends the service bearer token and hits the documented path", async () => {
  let seenUrl = "";
  let seenAuth: string | undefined;
  const client = new KernelClient({
    baseUrl: "http://kernel.test/api/kernel/v1",
    serviceToken: "svc-token-123",
    fetch: fakeFetch((url, init) => {
      seenUrl = url;
      seenAuth = (init?.headers as Record<string, string> | undefined)?.[
        "authorization"
      ];
      return {
        status: 200,
        body: {
          accountId: "acc_1",
          personId: "per_1",
          accountStatus: "ACTIVE",
          platformRole: "USER",
          displayName: "Ada Lovelace",
          memberships: [],
          contextVersion: 1,
        },
      };
    }),
  });

  const context = await client.getUserContext("acc_1");

  assert.equal(
    seenUrl,
    "http://kernel.test/api/kernel/v1/service/users/acc_1/context",
  );
  assert.equal(seenAuth, "Bearer svc-token-123");
  assert.equal(context.accountId, "acc_1");
});

test("getAuthoritySnapshot() forwards periodId/at as query params", async () => {
  let seenUrl = "";
  const client = new KernelClient({
    baseUrl: "http://kernel.test/api/kernel/v1",
    fetch: fakeFetch((url) => {
      seenUrl = url;
      return {
        status: 200,
        body: {
          snapshotId: "snap_1",
          organizationId: "org_1",
          periodId: "period_1",
          capturedAt: "2026-01-01T00:00:00.000Z",
          appointments: [],
        },
      };
    }),
  });

  await client.getAuthoritySnapshot("org_1", {
    periodId: "period_1",
    at: "2026-01-01T00:00:00.000Z",
  });

  const url = new URL(seenUrl);
  assert.equal(
    url.pathname,
    "/api/kernel/v1/service/organizations/org_1/authority-snapshot",
  );
  assert.equal(url.searchParams.get("periodId"), "period_1");
  assert.equal(url.searchParams.get("at"), "2026-01-01T00:00:00.000Z");
});

test("checkAuthorization() POSTs the request body as JSON to /service/authorization/check", async () => {
  let seenUrl = "";
  let seenBody: unknown;
  const client = new KernelClient({
    baseUrl: "http://kernel.test/api/kernel/v1",
    fetch: fakeFetch((url, init) => {
      seenUrl = url;
      seenBody = init?.body ? JSON.parse(String(init.body)) : undefined;
      return {
        status: 200,
        body: {
          allowed: true,
          decisionId: "dec_1",
          subjectId: "per_1",
          permission: "meetings.meeting.create",
          matchedAssignments: [],
          reasonCodes: ["ROLE_ALLOWED"],
          evaluatedAt: "2026-01-01T00:00:00.000Z",
        },
      };
    }),
  });

  const decision = await client.checkAuthorization({
    subjectId: "per_1",
    permission: "meetings.meeting.create",
  });

  assert.equal(
    seenUrl,
    "http://kernel.test/api/kernel/v1/service/authorization/check",
  );
  assert.deepEqual(seenBody, {
    subjectId: "per_1",
    permission: "meetings.meeting.create",
  });
  assert.equal(decision.allowed, true);
});

test("throws a descriptive error on a non-2xx response instead of returning malformed data", async () => {
  const client = new KernelClient({
    baseUrl: "http://kernel.test/api/kernel/v1",
    fetch: fakeFetch(() => ({
      status: 404,
      body: { code: "KERNEL_NOT_FOUND", detail: "not found" },
    })),
  });

  await assert.rejects(
    () => client.getPerson("missing"),
    /Kernel API request failed: GET \/service\/persons\/missing -> 404/,
  );
});
