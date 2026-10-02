import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { MiRotaractAuth } from "./auth.ts";
import { MiRotaractConfigError, MiRotaractOAuthError } from "./errors.ts";
import {
  CLIENT_ID,
  CLIENT_SECRET,
  FakeKernel,
  ISSUER,
  noSleep,
  REDIRECT_URI,
} from "./test-support.ts";

async function setup(
  options: { clientSecret?: string | null; jwksCooldownMs?: number } = {},
) {
  const kernel = await FakeKernel.create();
  const auth = new MiRotaractAuth({
    issuer: ISSUER,
    clientId: CLIENT_ID,
    clientSecret:
      options.clientSecret === null
        ? undefined
        : (options.clientSecret ?? CLIENT_SECRET),
    redirectUri: REDIRECT_URI,
    fetch: kernel.fetch,
    sleep: noSleep,
    jwksCooldownMs: options.jwksCooldownMs,
  });
  return { kernel, auth };
}

function oidcTokenRoute(
  kernel: FakeKernel,
  opts: { nonce?: string; withRefresh?: boolean } = {},
) {
  kernel.on("POST", "/oauth/token", async (req) => {
    const grant = req.form.get("grant_type");
    if (grant === "authorization_code" && req.form.get("code") !== "mrc_good")
      return {
        status: 400,
        body: {
          error: "invalid_grant",
          error_description: "Invalid authorization code",
        },
      };
    if (grant === "refresh_token" && req.form.get("refresh_token") !== "mrr_1")
      return { status: 400, body: { error: "invalid_grant" } };
    return {
      body: {
        access_token: await kernel.sign(
          {
            client_id: CLIENT_ID,
            azp: CLIENT_ID,
            token_use: "user",
            scope: "openid profile",
          },
          { audience: "institutional-kernel" },
        ),
        token_type: "Bearer",
        expires_in: 600,
        scope: "openid profile",
        id_token: await kernel.sign({
          azp: CLIENT_ID,
          name: "Ana Pérez",
          auth_time: Math.floor(Date.now() / 1000),
          ...(grant === "authorization_code" && opts.nonce
            ? { nonce: opts.nonce }
            : {}),
        }),
        ...(opts.withRefresh !== false
          ? { refresh_token: grant === "refresh_token" ? "mrr_2" : "mrr_1" }
          : {}),
      },
    };
  });
}

test("authorizationUrl builds a PKCE S256 request from discovery", async () => {
  const { auth } = await setup();
  const req = await auth.authorizationUrl({
    scope: ["openid", "profile", "memberships"],
  });
  const url = new URL(req.url);
  assert.equal(
    `${url.origin}${url.pathname}`,
    "https://web.test/oauth/authorize",
  );
  const p = url.searchParams;
  assert.equal(p.get("response_type"), "code");
  assert.equal(p.get("client_id"), CLIENT_ID);
  assert.equal(p.get("redirect_uri"), REDIRECT_URI);
  assert.equal(p.get("scope"), "openid profile memberships");
  assert.equal(p.get("code_challenge_method"), "S256");
  assert.equal(p.get("state"), req.state);
  assert.equal(p.get("nonce"), req.nonce);
  assert.match(req.codeVerifier, /^[A-Za-z0-9_-]{43,128}$/);
  assert.equal(
    p.get("code_challenge"),
    createHash("sha256").update(req.codeVerifier).digest("base64url"),
  );
  const other = await auth.authorizationUrl({ state: "s1", nonce: "n1" });
  assert.equal(other.state, "s1");
  assert.equal(other.nonce, "n1");
  assert.notEqual(other.codeVerifier, req.codeVerifier);
  assert.equal(
    new URL(other.url).searchParams.get("scope"),
    "openid profile email",
  );
});

test("exchangeCode sends code + verifier + redirect_uri and verifies the ID token", async () => {
  const { kernel, auth } = await setup();
  oidcTokenRoute(kernel, { nonce: "n-1" });
  const result = await auth.exchangeCode({
    code: "mrc_good",
    codeVerifier: "v".repeat(43),
    nonce: "n-1",
  });
  assert.equal(result.claims?.sub, "person_1");
  assert.equal(result.claims?.name, "Ana Pérez");
  assert.equal(result.refreshToken, "mrr_1");
  assert.ok(result.expiresAt > Date.now());
  const call = kernel.callsTo("POST", "/oauth/token")[0];
  assert.equal(call.form.get("grant_type"), "authorization_code");
  assert.equal(call.form.get("code_verifier"), "v".repeat(43));
  assert.equal(call.form.get("redirect_uri"), REDIRECT_URI);
  assert.match(call.headers.get("authorization")!, /^Basic /);
});

test("exchangeCode rejects a nonce mismatch and server errors are typed", async () => {
  const { kernel, auth } = await setup();
  oidcTokenRoute(kernel, { nonce: "n-1" });
  await assert.rejects(
    auth.exchangeCode({
      code: "mrc_good",
      codeVerifier: "v".repeat(43),
      nonce: "other",
    }),
    (e: unknown) =>
      e instanceof MiRotaractOAuthError && e.error === "invalid_token",
  );
  await assert.rejects(
    auth.exchangeCode({ code: "mrc_bad", codeVerifier: "v".repeat(43) }),
    (e: unknown) =>
      e instanceof MiRotaractOAuthError &&
      e.error === "invalid_grant" &&
      e.status === 400,
  );
});

test("public client (no secret) authenticates with client_id in the body", async () => {
  const { kernel, auth } = await setup({ clientSecret: null });
  kernel.on("POST", "/oauth/token", async (req) => {
    assert.equal(req.headers.get("authorization"), null);
    assert.equal(req.form.get("client_id"), CLIENT_ID);
    assert.equal(req.form.get("client_secret"), null);
    return {
      body: {
        access_token: "at",
        token_type: "Bearer",
        expires_in: 600,
        scope: "openid",
        id_token: await kernel.sign({}),
      },
    };
  });
  const result = await auth.exchangeCode({
    code: "c",
    codeVerifier: "v".repeat(43),
  });
  assert.equal(result.claims?.sub, "person_1");
});

test("verifyIdToken rejects wrong audience, issuer, expired and garbage", async () => {
  const { kernel, auth } = await setup();
  const isInvalid = (e: unknown) =>
    e instanceof MiRotaractOAuthError && e.error === "invalid_token";
  await assert.rejects(
    auth.verifyIdToken(await kernel.sign({}, { audience: "someone-else" })),
    isInvalid,
  );
  await assert.rejects(
    auth.verifyIdToken(await kernel.sign({}, { issuer: "https://evil.test" })),
    isInvalid,
  );
  await assert.rejects(
    auth.verifyIdToken(await kernel.sign({}, { expiresIn: -120 })),
    isInvalid,
  );
  await assert.rejects(
    auth.verifyIdToken(await kernel.sign({ azp: "mra_other" })),
    isInvalid,
  );
  await assert.rejects(auth.verifyIdToken("not-a-jwt"), isInvalid);
  const claims = await auth.verifyIdToken(await kernel.sign({ nonce: "n" }), {
    nonce: "n",
  });
  assert.equal(claims.nonce, "n");
});

test("verifyIdToken maxAgeSec checks auth_time", async () => {
  const { kernel, auth } = await setup();
  const old = await kernel.sign({
    auth_time: Math.floor(Date.now() / 1000) - 3600,
  });
  await assert.rejects(
    auth.verifyIdToken(old, { maxAgeSec: 300 }),
    MiRotaractOAuthError,
  );
  assert.ok(await auth.verifyIdToken(old, { maxAgeSec: 7200 }));
});

test("JWKS is cached and re-fetched when a new kid appears (key rotation)", async () => {
  const { kernel, auth } = await setup({ jwksCooldownMs: 0 });
  await auth.verifyIdToken(await kernel.sign({}));
  await auth.verifyIdToken(await kernel.sign({}));
  assert.equal(kernel.callsTo("GET", "/.well-known/jwks.json").length, 1);
  await kernel.addKey("k2");
  await auth.verifyIdToken(await kernel.sign({}, { kid: "k2" }));
  assert.equal(kernel.callsTo("GET", "/.well-known/jwks.json").length, 2);
  assert.equal(
    kernel.callsTo("GET", "/.well-known/openid-configuration").length,
    1,
  );
});

test("refresh rotates and returns verified claims", async () => {
  const { kernel, auth } = await setup();
  oidcTokenRoute(kernel);
  const result = await auth.refresh("mrr_1");
  assert.equal(result.refreshToken, "mrr_2");
  assert.equal(result.claims?.sub, "person_1");
  assert.equal(
    kernel.callsTo("POST", "/oauth/token")[0].form.get("refresh_token"),
    "mrr_1",
  );
  await assert.rejects(
    auth.refresh("mrr_1_reused_elsewhere"),
    (e: unknown) =>
      e instanceof MiRotaractOAuthError && e.error === "invalid_grant",
  );
});

test("userInfo sends the bearer token; 401 → MiRotaractOAuthError invalid_token", async () => {
  const { kernel, auth } = await setup();
  kernel.on("GET", "/oauth/userinfo", (req) =>
    req.headers.get("authorization") === "Bearer good"
      ? { body: { sub: "person_1", email: "ana@example.test" } }
      : { status: 401, body: { error: "invalid_token" } },
  );
  assert.equal((await auth.userInfo("good")).email, "ana@example.test");
  await assert.rejects(
    auth.userInfo("bad"),
    (e: unknown) =>
      e instanceof MiRotaractOAuthError && e.error === "invalid_token",
  );
});

test("revoke posts the token with client authentication", async () => {
  const { kernel, auth } = await setup();
  kernel.on("POST", "/oauth/revoke", () => ({ body: {} }));
  await auth.revoke("mrr_1", { tokenTypeHint: "refresh_token" });
  const call = kernel.callsTo("POST", "/oauth/revoke")[0];
  assert.equal(call.form.get("token"), "mrr_1");
  assert.equal(call.form.get("token_type_hint"), "refresh_token");
  assert.match(call.headers.get("authorization")!, /^Basic /);
});

test("verifyAccessToken checks token_use and the app", async () => {
  const { kernel, auth } = await setup();
  const good = await kernel.sign(
    { client_id: CLIENT_ID, token_use: "user", scope: "openid" },
    { audience: "institutional-kernel" },
  );
  assert.equal((await auth.verifyAccessToken(good)).sub, "person_1");
  const service = await kernel.sign(
    { client_id: CLIENT_ID, token_use: "service" },
    { audience: "institutional-kernel" },
  );
  await assert.rejects(auth.verifyAccessToken(service), MiRotaractOAuthError);
  const otherApp = await kernel.sign(
    { client_id: "mra_x", azp: "mra_x", token_use: "user" },
    { audience: "institutional-kernel" },
  );
  await assert.rejects(auth.verifyAccessToken(otherApp), MiRotaractOAuthError);
  const idToken = await kernel.sign({
    token_use: "user",
    client_id: CLIENT_ID,
  });
  await assert.rejects(auth.verifyAccessToken(idToken), MiRotaractOAuthError);
});

test("parseCallback checks state and surfaces access_denied", async () => {
  const { auth } = await setup();
  assert.deepEqual(
    auth.parseCallback("https://app.test/callback?code=c1&state=s1", {
      state: "s1",
    }),
    { code: "c1", state: "s1" },
  );
  assert.throws(
    () =>
      auth.parseCallback("https://app.test/callback?code=c1&state=evil", {
        state: "s1",
      }),
    (e: unknown) =>
      e instanceof MiRotaractOAuthError && e.error === "invalid_state",
  );
  assert.throws(
    () =>
      auth.parseCallback("/callback?error=access_denied&state=s1", {
        state: "s1",
      }),
    (e: unknown) =>
      e instanceof MiRotaractOAuthError && e.error === "access_denied",
  );
});

test("discovery with a different issuer is rejected", async () => {
  const kernel = await FakeKernel.create();
  const auth = new MiRotaractAuth({
    issuer: "https://other.test/api/kernel/v1",
    clientId: CLIENT_ID,
    redirectUri: REDIRECT_URI,
    fetch: (input, init) =>
      kernel.fetch(
        String(input).replace("https://other.test", "https://kernel.test"),
        init,
      ),
  });
  await assert.rejects(auth.discovery(), MiRotaractConfigError);
});

test("browser: a PUBLIC client works, a secret is refused", async () => {
  const g = globalThis as Record<string, unknown>;
  g.window = {};
  g.document = {};
  try {
    assert.throws(
      () =>
        new MiRotaractAuth({
          issuer: ISSUER,
          clientId: CLIENT_ID,
          clientSecret: CLIENT_SECRET,
          redirectUri: REDIRECT_URI,
        }),
      MiRotaractConfigError,
    );
    assert.ok(
      new MiRotaractAuth({
        issuer: ISSUER,
        clientId: CLIENT_ID,
        redirectUri: REDIRECT_URI,
      }),
    );
  } finally {
    delete g.window;
    delete g.document;
  }
});
