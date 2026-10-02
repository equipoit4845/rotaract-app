import assert from "node:assert/strict";
import { test } from "node:test";

import { MiRotaractAuth } from "./auth.ts";
import { MiRotaractConfigError } from "./errors.ts";
import { createMiRotaractNext } from "./next.ts";
import {
  CLIENT_ID,
  CLIENT_SECRET,
  FakeKernel,
  ISSUER,
  noSleep,
} from "./test-support.ts";

const APP = "https://app.test";
const SECRET = "x".repeat(40);

async function setup(options: { storeTokens?: boolean } = {}) {
  const kernel = await FakeKernel.create();
  const auth = new MiRotaractAuth({
    issuer: ISSUER,
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    redirectUri: `${APP}/auth/callback`,
    fetch: kernel.fetch,
    sleep: noSleep,
  });
  const mr = createMiRotaractNext({
    auth,
    secret: SECRET,
    scope: "openid profile email",
    ...options,
  });
  let lastNonce = "";
  let lastChallenge = "";
  kernel.on("POST", "/oauth/token", async (req) => {
    if (req.form.get("code") !== "mrc_ok")
      return { status: 400, body: { error: "invalid_grant" } };
    const verifier = req.form.get("code_verifier")!;
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
    );
    assert.equal(Buffer.from(digest).toString("base64url"), lastChallenge);
    return {
      body: {
        access_token: "at_1",
        token_type: "Bearer",
        expires_in: 600,
        scope: "openid profile email",
        refresh_token: "mrr_1",
        id_token: await kernel.sign({
          nonce: lastNonce,
          name: "Ana",
          email: "ana@example.test",
          azp: CLIENT_ID,
        }),
      },
    };
  });
  kernel.on("POST", "/oauth/revoke", () => ({ body: {} }));
  const remember = (location: string) => {
    const url = new URL(location);
    lastNonce = url.searchParams.get("nonce")!;
    lastChallenge = url.searchParams.get("code_challenge")!;
    return url;
  };
  return { kernel, mr, remember };
}

function setCookies(response: Response): Record<string, string> {
  const result: Record<string, string> = {};
  for (const header of response.headers.getSetCookie()) {
    const [pair] = header.split(";");
    const index = pair.indexOf("=");
    result[pair.slice(0, index)] = decodeURIComponent(pair.slice(index + 1));
  }
  return result;
}

async function loginFlow(
  ctx: Awaited<ReturnType<typeof setup>>,
  returnTo = "/panel",
) {
  const login = await ctx.mr.login(
    new Request(`${APP}/auth/login?returnTo=${encodeURIComponent(returnTo)}`),
  );
  assert.equal(login.status, 302);
  const authorize = ctx.remember(login.headers.get("location")!);
  const tx = setCookies(login)["mirotaract_session_tx"];
  assert.ok(tx);
  const callback = await ctx.mr.callback(
    new Request(
      `${APP}/auth/callback?code=mrc_ok&state=${authorize.searchParams.get("state")}`,
      {
        headers: { cookie: `mirotaract_session_tx=${encodeURIComponent(tx)}` },
      },
    ),
  );
  return { login, callback, authorize };
}

test("login → callback → session cookie → getSession", async () => {
  const ctx = await setup();
  const { login, callback, authorize } = await loginFlow(ctx);
  assert.equal(
    `${authorize.origin}${authorize.pathname}`,
    "https://web.test/oauth/authorize",
  );
  const txHeader = login.headers.getSetCookie()[0];
  assert.match(txHeader, /HttpOnly/);
  assert.match(txHeader, /SameSite=Lax/);
  assert.match(txHeader, /Secure/);
  assert.equal(callback.status, 302);
  assert.equal(callback.headers.get("location"), "/panel");
  const cookies = setCookies(callback);
  assert.equal(cookies["mirotaract_session_tx"], "");
  const session = await ctx.mr.getSession(
    `mirotaract_session=${encodeURIComponent(cookies["mirotaract_session"])}`,
  );
  assert.equal(session?.user.sub, "person_1");
  assert.equal(session?.user.email, "ana@example.test");
  assert.equal(
    session?.refreshToken,
    undefined,
    "tokens are not stored by default",
  );
  const viaStore = await ctx.mr.getSession({
    get: () => ({ value: cookies["mirotaract_session"] }),
  });
  assert.equal(viaStore?.user.sub, "person_1");
});

test("tampered or missing session cookie → null", async () => {
  const ctx = await setup();
  const { callback } = await loginFlow(ctx);
  const value = setCookies(callback)["mirotaract_session"];
  assert.equal(
    await ctx.mr.getSession(`mirotaract_session=${value.slice(0, -4)}AAAA`),
    null,
  );
  assert.equal(await ctx.mr.getSession(new Request(APP)), null);
  const other = createMiRotaractNext({
    auth: {} as any,
    secret: "y".repeat(40),
  });
  assert.equal(await other.getSession(`mirotaract_session=${value}`), null);
});

test("callback with a wrong state or no transaction cookie fails safely", async () => {
  const ctx = await setup();
  const login = await ctx.mr.login(new Request(`${APP}/auth/login`));
  const tx = setCookies(login)["mirotaract_session_tx"];
  const bad = await ctx.mr.callback(
    new Request(`${APP}/auth/callback?code=mrc_ok&state=forged`, {
      headers: { cookie: `mirotaract_session_tx=${tx}` },
    }),
  );
  assert.equal(bad.headers.get("location"), "/?error=invalid_state");
  const none = await ctx.mr.callback(
    new Request(`${APP}/auth/callback?code=mrc_ok&state=x`),
  );
  assert.equal(none.headers.get("location"), "/?error=login_expired");
  const denied = await ctx.mr.callback(
    new Request(`${APP}/auth/callback?error=access_denied`, {
      headers: { cookie: `mirotaract_session_tx=${tx}` },
    }),
  );
  assert.equal(denied.headers.get("location"), "/?error=access_denied");
});

test("returnTo only accepts same-site relative paths", async () => {
  const ctx = await setup();
  const { callback } = await loginFlow(ctx, "https://evil.test/");
  assert.equal(callback.headers.get("location"), "/");
  const again = await loginFlow(ctx, "//evil.test");
  assert.equal(again.callback.headers.get("location"), "/");
});

test("storeTokens keeps tokens; logout revokes the refresh token and clears the cookie", async () => {
  const ctx = await setup({ storeTokens: true });
  const { callback } = await loginFlow(ctx);
  const value = setCookies(callback)["mirotaract_session"];
  const session = await ctx.mr.getSession(`mirotaract_session=${value}`);
  assert.equal(session?.refreshToken, "mrr_1");
  assert.equal(session?.accessToken, "at_1");
  const logout = await ctx.mr.logout(
    new Request(`${APP}/auth/logout`, {
      method: "POST",
      headers: { cookie: `mirotaract_session=${value}` },
    }),
  );
  assert.equal(logout.headers.get("location"), "/");
  assert.match(logout.headers.getSetCookie()[0], /Max-Age=0/);
  assert.equal(
    ctx.kernel.callsTo("POST", "/oauth/revoke")[0].form.get("token"),
    "mrr_1",
  );
});

test("requires a strong secret", async () => {
  const ctx = await setup();
  assert.throws(
    () => createMiRotaractNext({ auth: {} as any, secret: "short" }),
    MiRotaractConfigError,
  );
  assert.ok(ctx.mr.cookieName);
});
