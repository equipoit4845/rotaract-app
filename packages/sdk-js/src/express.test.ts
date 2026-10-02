import assert from "node:assert/strict";
import { test } from "node:test";

import { MiRotaractAuth } from "./auth.ts";
import { requireMiRotaractUser } from "./express.ts";
import {
  CLIENT_ID,
  FakeKernel,
  ISSUER,
  noSleep,
  REDIRECT_URI,
} from "./test-support.ts";

function fakeRes() {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    setHeader(name: string, value: string) {
      res.headers[name.toLowerCase()] = value;
    },
    json(body: unknown) {
      res.body = body;
    },
  };
  return res;
}

async function run(
  mw: ReturnType<typeof requireMiRotaractUser>,
  headers: Record<string, string>,
  extra: Record<string, unknown> = {},
) {
  const req: any = { headers, ...extra };
  const res = fakeRes();
  let nextCalled: unknown = "not-called";
  await mw(req, res, (error?: unknown) => {
    nextCalled = error;
  });
  return { req, res, nextCalled };
}

async function setup() {
  const kernel = await FakeKernel.create();
  const auth = new MiRotaractAuth({
    issuer: ISSUER,
    clientId: CLIENT_ID,
    redirectUri: REDIRECT_URI,
    fetch: kernel.fetch,
    sleep: noSleep,
  });
  kernel.on("GET", "/oauth/userinfo", (req) =>
    req.headers.get("authorization") === "Bearer good"
      ? {
          body: {
            sub: "person_1",
            name: "Ana",
            memberships: [{ organizationId: "c1" }],
          },
        }
      : { status: 401, body: { error: "invalid_token" } },
  );
  return { kernel, auth };
}

test("bearer + userinfo: missing token → 401 with WWW-Authenticate", async () => {
  const { auth } = await setup();
  const { res, nextCalled } = await run(requireMiRotaractUser({ auth }), {});
  assert.equal(res.statusCode, 401);
  assert.match(
    res.headers["www-authenticate"],
    /^Bearer error="invalid_token"/,
  );
  assert.equal(nextCalled, "not-called");
});

test("bearer + userinfo: valid token attaches the user and is cached", async () => {
  const { kernel, auth } = await setup();
  const mw = requireMiRotaractUser({ auth });
  const first = await run(mw, { authorization: "Bearer good" });
  assert.equal(first.nextCalled, undefined);
  assert.equal(first.req.miRotaract.user.sub, "person_1");
  assert.equal(first.req.miRotaract.accessToken, "good");
  await run(mw, { authorization: "Bearer good" });
  assert.equal(kernel.callsTo("GET", "/oauth/userinfo").length, 1);
});

test("bearer + userinfo: rejected token → 401", async () => {
  const { auth } = await setup();
  const { res } = await run(requireMiRotaractUser({ auth }), {
    authorization: "Bearer bad",
  });
  assert.equal(res.statusCode, 401);
  assert.deepEqual((res.body as { error: string }).error, "invalid_token");
});

test("bearer + jwt: verifies locally without calling userinfo", async () => {
  const { kernel, auth } = await setup();
  const token = await kernel.sign(
    { client_id: CLIENT_ID, token_use: "user", scope: "openid" },
    { audience: "institutional-kernel" },
  );
  const { req, nextCalled } = await run(
    requireMiRotaractUser({ auth, verify: "jwt" }),
    { authorization: `Bearer ${token}` },
  );
  assert.equal(nextCalled, undefined);
  assert.equal(req.miRotaract.user.sub, "person_1");
  assert.equal(kernel.callsTo("GET", "/oauth/userinfo").length, 0);
  const forged = await run(requireMiRotaractUser({ auth, verify: "jwt" }), {
    authorization: "Bearer a.b.c",
  });
  assert.equal(forged.res.statusCode, 401);
});

test("authorize hook can deny with 403", async () => {
  const { auth } = await setup();
  const mw = requireMiRotaractUser({
    auth,
    authorize: (user) =>
      Boolean(user.memberships?.some((m) => m.organizationId === "c2")),
  });
  const { res } = await run(mw, { authorization: "Bearer good" });
  assert.equal(res.statusCode, 403);
});

test("session source reads the user from the app's session", async () => {
  const mw = requireMiRotaractUser({
    source: "session",
    getUser: (req: any) => req.session?.user,
  });
  const ok = await run(mw, {}, { session: { user: { sub: "person_1" } } });
  assert.equal(ok.req.miRotaract.user.sub, "person_1");
  const anonymous = await run(mw, {}, { session: {} });
  assert.equal(anonymous.res.statusCode, 401);
});

test("unexpected errors go to next(error)", async () => {
  const { kernel, auth } = await setup();
  kernel.on("GET", "/oauth/userinfo", () => ({
    status: 500,
    body: { status: 500, code: "KERNEL_HTTP_500" },
  }));
  const { nextCalled } = await run(requireMiRotaractUser({ auth }), {
    authorization: "Bearer good",
  });
  assert.ok(nextCalled instanceof Error);
});
