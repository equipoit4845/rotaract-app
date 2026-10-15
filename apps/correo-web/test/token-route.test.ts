import assert from "node:assert/strict";
import { test } from "node:test";

import { jwtVerify } from "jose";

import {
  CORREO_TOKEN_TTL_SEC,
  mintCorreoToken,
} from "@/lib/server/correo-token";
import { sessionTokenResponse } from "@/lib/server/token-route";

const SECRET = "s".repeat(40);
const key = new TextEncoder().encode(SECRET);
const session = {
  user: { sub: "per_123", name: "Ana Pérez", email: "ana@example.test" },
};

test("GET /api/session/token without a session is 401", async () => {
  const res = await sessionTokenResponse(null, SECRET);
  assert.equal(res.status, 401);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.deepEqual(await res.json(), { error: "unauthenticated" });
});

test("with a session it mints the correo token: sub=personId, aud/iss, 15 min, no email", async () => {
  const now = Date.UTC(2026, 9, 15, 12, 0, 0);
  const res = await sessionTokenResponse(session, SECRET, now);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const body = (await res.json()) as { token: string; expiresAt: number };
  assert.equal(body.expiresAt, now + CORREO_TOKEN_TTL_SEC * 1000);

  const { payload, protectedHeader } = await jwtVerify(body.token, key, {
    audience: "correo-api",
    issuer: "correo-web",
    algorithms: ["HS256"],
    currentDate: new Date(now + 1000),
  });
  assert.equal(protectedHeader.alg, "HS256");
  assert.equal(payload.sub, "per_123");
  assert.equal(payload.name, "Ana Pérez");
  assert.equal("email" in payload, false);
  assert.equal(payload.exp! - payload.iat!, 15 * 60);
});

test("the token is rejected after 15 minutes and with another secret", async () => {
  const now = Date.now();
  const { token } = await mintCorreoToken(session.user, SECRET, now);
  await assert.rejects(
    jwtVerify(token, key, {
      audience: "correo-api",
      currentDate: new Date(now + 16 * 60 * 1000),
    }),
  );
  await assert.rejects(
    jwtVerify(token, new TextEncoder().encode("x".repeat(40)), {
      audience: "correo-api",
    }),
  );
});

test("a missing or short CORREO_TOKEN_SECRET is a 500, never an unsigned token", async () => {
  for (const secret of [undefined, "", "too-short"]) {
    const res = await sessionTokenResponse(session, secret);
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { error: "token_unavailable" });
  }
});

test("name is optional", async () => {
  const { token } = await mintCorreoToken({ sub: "per_9" }, SECRET);
  const { payload } = await jwtVerify(token, key, { audience: "correo-api" });
  assert.equal(payload.sub, "per_9");
  assert.equal("name" in payload, false);
});
