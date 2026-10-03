import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, test } from "node:test";

import { readSolution } from "../src/files.js";
import { GRADERS } from "../src/graders/index.js";
import { extractScopes } from "../src/graders/minimal-scopes.js";

function project(files) {
  const dir = mkdtempSync(join(tmpdir(), "eval-g-"));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return readSolution(dir);
}
const grade = (id, files, options = {}) => GRADERS[id].grade({ solution: project(files), options, env: {} });

describe("no-web-storage-tokens", () => {
  test("flags tokens in web storage, ignores other keys and comments", async () => {
    assert.equal((await grade("no-web-storage-tokens", { "a.ts": 'sessionStorage.setItem("access_token", t);' })).status, "fail");
    assert.equal((await grade("no-web-storage-tokens", { "a.ts": "window.localStorage['jwt'] = x;" })).status, "fail");
    assert.equal((await grade("no-web-storage-tokens", { "a.ts": 'localStorage.setItem("theme", "dark"); // localStorage.setItem("token", t)' })).status, "pass");
    assert.equal((await grade("no-web-storage-tokens", { "a.html": "<script>localStorage.setItem('id_token', t)</script>" })).status, "fail");
  });
});

describe("jwks-verification", () => {
  test("manual jose needs issuer, audience, ES256 and a nonce check", async () => {
    const base = 'import { createRemoteJWKSet, jwtVerify } from "jose";\nconst jwks = createRemoteJWKSet(new URL(u));\n';
    assert.equal((await grade("jwks-verification", { "a.ts": `${base}await jwtVerify(t, jwks, { issuer: I, audience: A });` })).status, "fail");
    assert.equal((await grade("jwks-verification", { "a.ts": `${base}await jwtVerify(t, jwks, { issuer: I, audience: A, algorithms: ["HS256"] });` })).status, "fail");
    assert.equal((await grade("jwks-verification", { "a.ts": `${base}const { payload } = await jwtVerify(t, jwks, { issuer: I, audience: A, algorithms: ["ES256"] });` })).status, "fail"); // no nonce
    assert.equal((await grade("jwks-verification", { "a.ts": `${base}const { payload } = await jwtVerify(t, jwks, { issuer: I, audience: A, algorithms: ["ES256"] });\nif (payload.nonce !== n) throw 1;` })).status, "pass");
  });

  test("decoding without verifying fails, also next to the SDK", async () => {
    const r = await grade("jwks-verification", { "a.ts": 'import { MiRotaractAuth } from "@mirotaract/sdk";\nimport { decodeJwt } from "jose";\nconst c = decodeJwt(t);' });
    assert.equal(r.status, "fail");
    assert.equal((await grade("jwks-verification", { "a.ts": 'const claims = JSON.parse(atob(token.split(".")[1]));' })).status, "fail");
  });

  test("Python: PyJWT with JWKS passes; verify_signature False fails; SDK passes", async () => {
    const ok = 'import jwt\nc = jwt.PyJWKClient(f"{ISSUER}/.well-known/jwks.json")\nclaims = jwt.decode(t, key, algorithms=["ES256"], audience=CID, issuer=ISSUER)\nif claims["nonce"] != n: raise X\n';
    assert.equal((await grade("jwks-verification", { "a.py": ok })).status, "pass");
    assert.equal((await grade("jwks-verification", { "a.py": 'import jwt\nclaims = jwt.decode(t, options={"verify_signature": False})\n' })).status, "fail");
    assert.equal((await grade("jwks-verification", { "a.py": "from mirotaract import AsyncMiRotaractAuth\ntokens = await auth.exchange_code(code, v, nonce=n)\n" })).status, "pass");
    assert.equal((await grade("jwks-verification", { "a.py": "from mirotaract import AsyncMiRotaractAuth\ntokens = await auth.exchange_code(code, v)\n" })).status, "fail");
  });

  test("nothing at all fails", async () => {
    assert.equal((await grade("jwks-verification", { "a.ts": "export const x = 1;" })).status, "fail");
  });
});

describe("minimal-scopes", () => {
  test("extracts login and service scopes from strings and lists, ignoring comments", () => {
    const s = extractScopes(project({
      "a.ts": '// "openid email"\nconst LOGIN = "openid profile";\nnew MiRotaract({ scope: ["kernel.service.memberships.read"] });',
      "b.dart": "static const scopes = ['openid', 'memberships'];",
    }));
    assert.deepEqual(s.oidc, ["memberships", "openid", "profile"]);
    assert.deepEqual(s.service, ["kernel.service.memberships.read"]);
  });

  test("SDK login without scope counts as the SDK default (openid profile email)", async () => {
    const r = await grade("minimal-scopes", { "a.ts": 'import { MiRotaractAuth } from "@mirotaract/sdk";\nnew MiRotaractAuth({ issuer, clientId, redirectUri });' }, { required: ["openid"], allowed: ["openid", "profile"] });
    assert.equal(r.status, "fail");
    assert.match(r.details.join(" "), /email/);
  });

  test("service token without an explicit scope fails when required", async () => {
    const r = await grade("minimal-scopes", { "a.py": "client = MiRotaract(url, cid, secret)\n" }, { allowed: ["kernel.service.memberships.read"], requireExplicitServiceScope: true });
    assert.equal(r.status, "fail");
  });
});

describe("no-client-secrets", () => {
  test("hardcoded secrets, NEXT_PUBLIC secrets, secrets in client code and unignored .env.local", async () => {
    assert.equal((await grade("no-client-secrets", { "a.ts": 'const s = "mrs_abcdefghijklmnopqrstuvwxyz";' })).status, "fail");
    assert.equal((await grade("no-client-secrets", { "a.ts": 'const s = "mrs_xxxxxxxxxxxxxxxxxxxxxxxx";' })).status, "pass"); // placeholder
    assert.equal((await grade("no-client-secrets", { "a.tsx": '"use client";\nconst s = process.env.MIROTARACT_CLIENT_SECRET;' })).status, "fail");
    assert.equal((await grade("no-client-secrets", { "lib/auth.dart": "const clientSecret = String.fromEnvironment('X');" })).status, "fail");
    assert.equal((await grade("no-client-secrets", { ".env.local": "MIROTARACT_CLIENT_SECRET=abc\n", ".gitignore": "node_modules\n", "a.ts": "" })).status, "fail");
    assert.equal((await grade("no-client-secrets", { ".env.local": "MIROTARACT_CLIENT_SECRET=abc\n", ".gitignore": ".env*.local\n", "a.ts": "process.env.MIROTARACT_CLIENT_SECRET" })).status, "pass");
  });
});

describe("webhook-signature", () => {
  const route = (body) => ({ "src/app/api/webhooks/route.ts": body });
  test("manual HMAC needs timestamp payload, tolerance and constant-time compare", async () => {
    const partial = 'import { createHmac } from "node:crypto";\nconst e = createHmac("sha256", s).update(`${timestamp}.${raw}`).digest("hex");\nif (e === sig) ok();';
    const r = await grade("webhook-signature", route(partial));
    assert.equal(r.status, "fail");
    const python = 'import hmac, hashlib, time\nexpected = hmac.new(s.encode(), f"{timestamp}.".encode() + body, hashlib.sha256).hexdigest()\nif abs(time.time() - int(timestamp)) > 300: raise E\nif not hmac.compare_digest(sig, expected): raise E\n';
    assert.equal((await grade("webhook-signature", { "app/webhooks.py": python })).status, "pass");
  });

  test("SDK in Python passes; reading request.json() first fails", async () => {
    assert.equal((await grade("webhook-signature", { "app/webhooks.py": "from mirotaract import verify_webhook\nevent = verify_webhook(await request.body(), request.headers, s)\n" })).status, "pass");
    assert.equal((await grade("webhook-signature", { "app/webhooks.py": "from mirotaract import verify_webhook\npayload = await request.json()\nevent = verify_webhook(payload, request.headers, s)\n" })).status, "fail");
  });

  test("no endpoint → fail", async () => {
    assert.equal((await grade("webhook-signature", { "a.ts": "export {}" })).status, "fail");
  });
});

describe("no-pii-logs", () => {
  test("ids and types are fine; people, events and tokens are not", async () => {
    assert.equal((await grade("no-pii-logs", { "a.ts": "console.log(`evento ${event.type} ${event.id} ${event.data.membership.personId}`);\nconsole.log('listo', members.length);" })).status, "pass");
    assert.equal((await grade("no-pii-logs", { "a.ts": "console.log(member.person.email);" })).status, "fail");
    assert.equal((await grade("no-pii-logs", { "a.ts": "logger.info({ tokens });" })).status, "fail");
    assert.equal((await grade("no-pii-logs", { "a.py": 'log.info(f"evento {event[\'id\']} {event[\'type\']}")\n' })).status, "pass");
    assert.equal((await grade("no-pii-logs", { "a.py": 'print(f"socio {member[\'person\'][\'displayName\']}")\n' })).status, "fail");
  });
});

describe("pagination and idempotency", () => {
  test("pagination: SDK paginator or cursor loop", async () => {
    assert.equal((await grade("pagination", { "a.ts": "for await (const m of mr.members.list(id)) push(m);" })).status, "pass");
    assert.equal((await grade("pagination", { "a.py": "while True:\n    page = get(f'{API}/members', params)\n    if not page['pageInfo']['hasMore']: break\n    params['cursor'] = page['pageInfo']['nextCursor']\n" })).status, "pass");
    assert.equal((await grade("pagination", { "a.ts": "const page = await fetch(`${API}/service/organizations/${id}/members`);" })).status, "fail");
  });

  test("idempotency: dedupe by event id", async () => {
    assert.equal((await grade("webhook-idempotency", { "webhook.ts": "if (seen.has(event.id)) return; seen.add(event.id);" })).status, "pass");
    assert.equal((await grade("webhook-idempotency", { "webhook.ts": "await save(event.data);" })).status, "fail");
  });
});

describe("kernel-scopes", () => {
  test("skips without a local kernel and never touches a remote one", async () => {
    const solution = project({ "a.ts": 'new MiRotaract({ scope: ["kernel.service.memberships.read"] })' });
    assert.equal((await GRADERS["kernel-scopes"].grade({ solution, env: {} })).status, "skip");
    const remote = await GRADERS["kernel-scopes"].grade({ solution, env: { MIROTARACT_EVAL_KERNEL_URL: "https://api.rotaract4845.com/api/kernel/v1" } });
    assert.equal(remote.status, "skip");
    assert.match(remote.details[0], /no es local/);
  });
});
