import assert from "node:assert/strict";
import { test } from "node:test";

import { MiRotaract } from "./client.ts";
import {
  MiRotaractApiError,
  MiRotaractConfigError,
  MiRotaractOAuthError,
} from "./errors.ts";
import {
  CLIENT_ID,
  CLIENT_SECRET,
  FakeKernel,
  ISSUER,
  noSleep,
} from "./test-support.ts";

async function setup(
  options: Partial<ConstructorParameters<typeof MiRotaract>[0]> = {},
) {
  const kernel = await FakeKernel.create();
  const client = new MiRotaract({
    baseUrl: `${ISSUER}/`,
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    fetch: kernel.fetch,
    sleep: noSleep,
    ...options,
  });
  return { kernel, client };
}

const org = (id: string) => ({
  id,
  type: "CLUB",
  code: id,
  name: `Club ${id}`,
  slug: id,
  status: "ACTIVE",
  parentId: "d1",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

test("client_credentials token is cached and reused (Basic auth, discovered endpoint)", async () => {
  const { kernel, client } = await setup();
  kernel.on("GET", "/service/organizations/:id", (req) => ({
    body: org(req.url.pathname.split("/").pop()!),
  }));
  await client.clubs.get("c1");
  await client.clubs.get("c2");
  const tokenCalls = kernel.callsTo("POST", "/oauth/token");
  assert.equal(tokenCalls.length, 1);
  assert.equal(tokenCalls[0].form.get("grant_type"), "client_credentials");
  assert.equal(
    tokenCalls[0].headers.get("authorization"),
    `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`,
  );
  const apiCalls = kernel.callsTo("GET", "/service/organizations/c1");
  assert.equal(apiCalls[0].headers.get("authorization"), "Bearer svc_1");
  assert.deepEqual(client.grantedScopes, [
    "kernel.service.organizations.read",
    "kernel.service.memberships.read",
  ]);
});

test("token is renewed when it is within 60 s of expiring", async () => {
  const { kernel, client } = await setup();
  kernel.tokenExpiresIn = 50;
  kernel.on("GET", "/service/organizations/:id", () => ({ body: org("c1") }));
  await client.clubs.get("c1");
  await client.clubs.get("c1");
  assert.equal(kernel.callsTo("POST", "/oauth/token").length, 2);
});

test("concurrent calls share one token request", async () => {
  const { kernel, client } = await setup();
  kernel.on("GET", "/service/organizations/:id", () => ({ body: org("c1") }));
  await Promise.all([
    client.clubs.get("a"),
    client.clubs.get("b"),
    client.clubs.get("c"),
  ]);
  assert.equal(kernel.callsTo("POST", "/oauth/token").length, 1);
});

test("a 401 from the API refreshes the token once", async () => {
  const { kernel, client } = await setup();
  let n = 0;
  kernel.on("GET", "/service/organizations/:id", () =>
    ++n === 1
      ? {
          status: 401,
          body: {
            status: 401,
            code: "KERNEL_HTTP_401",
            detail: "Invalid service token",
          },
        }
      : { body: org("c1") },
  );
  assert.equal((await client.clubs.get("c1")).id, "c1");
  assert.equal(kernel.callsTo("POST", "/oauth/token").length, 2);
});

test("client_secret_post sends credentials in the body", async () => {
  const { kernel, client } = await setup({
    clientAuthMethod: "client_secret_post",
    scope: ["a", "b"],
  });
  await client.getAccessToken();
  const call = kernel.callsTo("POST", "/oauth/token")[0];
  assert.equal(call.headers.get("authorization"), null);
  assert.equal(call.form.get("client_id"), CLIENT_ID);
  assert.equal(call.form.get("client_secret"), CLIENT_SECRET);
  assert.equal(call.form.get("scope"), "a b");
});

test("invalid secret → MiRotaractOAuthError invalid_client", async () => {
  const { client } = await setup({ clientSecret: "mrs_wrong" });
  await assert.rejects(client.clubs.get("c1"), (e: unknown) => {
    assert.ok(e instanceof MiRotaractOAuthError);
    assert.equal(e.error, "invalid_client");
    return true;
  });
});

test("clubs.list follows nextCursor across pages and sends filters", async () => {
  const { kernel, client } = await setup();
  kernel.on("GET", "/service/organizations", (req) => {
    const cursor = req.url.searchParams.get("cursor");
    if (!cursor)
      return {
        body: {
          items: [org("a"), org("b")],
          pageInfo: { nextCursor: "p2", hasMore: true },
        },
      };
    if (cursor === "p2")
      return {
        body: {
          items: [org("c")],
          pageInfo: { nextCursor: "p3", hasMore: true },
        },
      };
    return {
      body: {
        items: [org("d")],
        pageInfo: { nextCursor: null, hasMore: false },
      },
    };
  });
  const ids: string[] = [];
  for await (const club of client.clubs.list({
    status: "ACTIVE",
    type: "CLUB",
    limit: 2,
    updatedSince: new Date("2026-01-01T00:00:00Z"),
  }))
    ids.push(club.id);
  assert.deepEqual(ids, ["a", "b", "c", "d"]);
  const first = kernel.callsTo("GET", "/service/organizations")[0].url
    .searchParams;
  assert.equal(first.get("status"), "ACTIVE");
  assert.equal(first.get("type"), "CLUB");
  assert.equal(first.get("limit"), "2");
  assert.equal(first.get("updatedSince"), "2026-01-01T00:00:00.000Z");
  assert.equal(first.get("cursor"), null);
  assert.equal((await client.clubs.list().all()).length, 4);
  assert.equal((await client.clubs.list().all({ max: 3 })).length, 3);
  const page = await client.clubs.list().page();
  assert.ok(!page.notModified);
  assert.equal(page.items.length, 2);
  assert.equal(page.pageInfo.nextCursor, "p2");
});

test("members.list paginates with limit + updatedSince", async () => {
  const { kernel, client } = await setup();
  const member = (id: string) => ({
    membershipId: id,
    organizationId: "c1",
    personId: `p_${id}`,
    status: "ACTIVE",
    person: {
      id: `p_${id}`,
      displayName: id,
      firstName: id,
      lastName: id,
      updatedAt: "2026-01-01T00:00:00Z",
    },
    updatedAt: "2026-01-01T00:00:00Z",
  });
  kernel.on("GET", "/service/organizations/c1/members", (req) =>
    req.url.searchParams.get("cursor") === "n"
      ? {
          body: {
            items: [member("m3")],
            pageInfo: { nextCursor: null, hasMore: false },
          },
        }
      : {
          body: {
            items: [member("m1"), member("m2")],
            pageInfo: { nextCursor: "n", hasMore: true },
          },
          headers: { etag: 'W/"v1"' },
        },
  );
  const members = await client.members
    .list("c1", {
      limit: 2,
      updatedSince: "2026-01-01T00:00:00Z",
      status: "ACTIVE",
    })
    .all();
  assert.deepEqual(
    members.map((m) => m.membershipId),
    ["m1", "m2", "m3"],
  );
  const q = kernel.callsTo("GET", "/service/organizations/c1/members")[0].url
    .searchParams;
  assert.equal(q.get("updatedSince"), "2026-01-01T00:00:00Z");
  assert.equal(q.get("status"), "ACTIVE");
});

test("members.list with ifNoneMatch surfaces 304 as { notModified: true }", async () => {
  const { kernel, client } = await setup();
  kernel.on("GET", "/service/organizations/c1/members", (req) =>
    req.headers.get("if-none-match") === 'W/"v1"'
      ? { status: 304, headers: { etag: 'W/"v1"' } }
      : {
          body: { items: [], pageInfo: { nextCursor: null, hasMore: false } },
          headers: { etag: 'W/"v1"' },
        },
  );
  const first = await client.members.list("c1").page();
  assert.equal(first.notModified, false);
  assert.equal(first.etag, 'W/"v1"');
  const again = await client.members
    .list("c1", { ifNoneMatch: first.etag })
    .page();
  assert.deepEqual(again, { notModified: true, etag: 'W/"v1"' });
  const paginator = client.members.list("c1", { ifNoneMatch: 'W/"v1"' });
  assert.deepEqual(await paginator.all(), []);
  assert.equal(paginator.notModified, true);
});

test("persons.get / memberships / batch (chunks of 100, deduped, retryable)", async () => {
  const { kernel, client } = await setup();
  kernel.on("GET", "/service/persons/:id", (req) => ({
    body: {
      id: req.url.pathname.split("/").pop(),
      displayName: "Ana",
      firstName: "Ana",
      lastName: "P",
      updatedAt: "x",
    },
  }));
  kernel.on("GET", "/service/persons/:id/memberships", () => ({
    body: [
      {
        membershipId: "m",
        organizationId: "c1",
        organizationName: "C",
        organizationType: "CLUB",
        status: "ACTIVE",
      },
    ],
  }));
  kernel.on("POST", "/service/persons/batch", (req) => ({
    body: req.json.ids.map((id: string) => ({
      id,
      displayName: id,
      firstName: id,
      lastName: id,
      updatedAt: "x",
    })),
  }));
  assert.equal((await client.persons.get("p 1")).id, "p%201");
  assert.equal(
    (await client.persons.memberships("p1"))[0].organizationId,
    "c1",
  );
  const ids = Array.from({ length: 250 }, (_, i) => `p${i}`);
  const people = await client.persons.batch([...ids, "p0", "p1"]);
  assert.equal(people.length, 250);
  const calls = kernel.callsTo("POST", "/service/persons/batch");
  assert.deepEqual(
    calls.map((c) => c.json.ids.length),
    [100, 100, 50],
  );
  for (const call of calls) assert.ok(call.headers.get("idempotency-key"));
});

test("authorities.list and periods.list pass their filters", async () => {
  const { kernel, client } = await setup();
  kernel.on("GET", "/service/organizations/d1/authorities", () => ({
    body: [{ appointmentId: "a1" }],
  }));
  kernel.on("GET", "/service/organizations/d1/periods", () => ({
    body: [{ id: "per1" }],
  }));
  assert.equal(
    (await client.authorities.list("d1", { includeDescendants: true }))[0]
      .appointmentId,
    "a1",
  );
  assert.equal(
    kernel
      .callsTo("GET", "/service/organizations/d1/authorities")[0]
      .url.searchParams.get("includeDescendants"),
    "true",
  );
  assert.equal(
    (await client.periods.list("d1", { status: "ACTIVE" }))[0].id,
    "per1",
  );
  assert.equal(
    kernel
      .callsTo("GET", "/service/organizations/d1/periods")[0]
      .url.searchParams.get("status"),
    "ACTIVE",
  );
});

test("permissions.check maps to AuthorizationCheckRequest; checkMany batches", async () => {
  const { kernel, client } = await setup();
  kernel.on("POST", "/service/authorization/check", (req) => ({
    body: {
      allowed: true,
      decisionId: "d",
      subjectId: req.json.subjectId,
      permission: req.json.permission,
      evaluatedAt: "x",
    },
  }));
  kernel.on("POST", "/service/authorization/batch-check", (req) => ({
    body: req.json.checks.map(() => ({
      allowed: false,
      decisionId: "d",
      subjectId: "s",
      permission: "p",
      evaluatedAt: "x",
    })),
  }));
  const decision = await client.permissions.check({
    personId: "p1",
    permission: "meetings.meeting.create",
    organizationId: "c1",
  });
  assert.equal(decision.allowed, true);
  assert.deepEqual(
    kernel.callsTo("POST", "/service/authorization/check")[0].json,
    {
      subjectId: "p1",
      permission: "meetings.meeting.create",
      scope: { type: "ORGANIZATION", organizationId: "c1" },
    },
  );
  const many = await client.permissions.checkMany([
    { personId: "p1", permission: "x", organizationId: "c1" },
    {
      personId: "p2",
      permission: "x",
      organizationId: "c1",
      scopeType: "ORGANIZATION_TREE",
    },
  ]);
  assert.equal(many.length, 2);
  assert.equal(
    kernel.callsTo("POST", "/service/authorization/batch-check")[0].json
      .checks[1].scope.type,
    "ORGANIZATION_TREE",
  );
});

test("out-of-scope organization → MiRotaractApiError 403", async () => {
  const { kernel, client } = await setup();
  kernel.on("GET", "/service/organizations/:id/members", () => ({
    status: 403,
    body: {
      type: "t",
      title: "Request failed",
      status: 403,
      code: "KERNEL_HTTP_403",
      detail: "Fuera del alcance de esta app",
      instance: "/x",
    },
  }));
  await assert.rejects(client.members.list("other").all(), (e: unknown) => {
    assert.ok(e instanceof MiRotaractApiError);
    assert.equal(e.status, 403);
    assert.equal(e.detail, "Fuera del alcance de esta app");
    return true;
  });
});

test("refuses a client secret in a browser-like runtime", async () => {
  const g = globalThis as Record<string, unknown>;
  g.window = {};
  g.document = {};
  try {
    assert.throws(
      () =>
        new MiRotaract({
          baseUrl: ISSUER,
          clientId: CLIENT_ID,
          clientSecret: CLIENT_SECRET,
        }),
      MiRotaractConfigError,
    );
  } finally {
    delete g.window;
    delete g.document;
  }
});

test("requires baseUrl, clientId and clientSecret", () => {
  assert.throws(
    () => new MiRotaract({ baseUrl: "", clientId: "x", clientSecret: "y" }),
    MiRotaractConfigError,
  );
  assert.throws(
    () => new MiRotaract({ baseUrl: ISSUER, clientId: "x", clientSecret: "" }),
    MiRotaractConfigError,
  );
});
