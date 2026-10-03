#!/usr/bin/env node
// Conformance runner for @mirotaract/sdk (JavaScript). Uses the BUILT package
// (pnpm --filter @mirotaract/sdk build) and runs every scenario of
// scenarios.json against a real, disposable Kernel. Env: see scenarios.json
// (`node sdks/conformance/seed.mjs` prints them).
//
//   node sdks/conformance/run-js.mjs [--json]
import { readFileSync } from "node:fs";

const sdkPath =
  process.env.MR_SDK_JS_PATH ??
  new URL("../../packages/sdk-js/dist/esm/index.js", import.meta.url).href;
const {
  MiRotaract,
  MiRotaractAuth,
  MiRotaractApiError,
  MiRotaractOAuthError,
  MiRotaractRateLimitError,
  MiRotaractWebhookError,
  verifyWebhook,
} = await import(sdkPath);

const spec = JSON.parse(
  readFileSync(new URL("./scenarios.json", import.meta.url), "utf8"),
);
const env = process.env;
const BASE = (env.MR_BASE_URL ?? "").replace(/\/+$/, "");
const SCOPE = "openid profile email memberships positions";

class Skip extends Error {}
class Pending extends Error {}

function need(...names) {
  for (const name of names) if (!env[name]) throw new Skip(`falta ${name}`);
}
function check(condition, message) {
  if (!condition) throw new Error(message);
}
async function expectError(promise, predicate, label) {
  try {
    await promise;
  } catch (error) {
    if (predicate(error)) return error;
    // A missing endpoint must surface as such (→ PENDING for unmerged epics).
    if (error instanceof MiRotaractApiError && error.status === 404)
      throw error;
    throw new Error(
      `se esperaba ${label}, llegó ${error?.name}: ${error?.message}`,
    );
  }
  throw new Error(`se esperaba ${label}, no hubo error`);
}
const isOAuth = (code) => (e) =>
  e instanceof MiRotaractOAuthError && e.error === code;
const isApi = (status) => (e) =>
  e instanceof MiRotaractApiError && e.status === status;

// Counts token requests going through the SDK's fetch.
let tokenRequests = 0;
const countingFetch = (input, init) => {
  if (String(input).endsWith("/oauth/token")) tokenRequests++;
  return fetch(input, init);
};

const newClient = (overrides = {}) =>
  new MiRotaract({
    baseUrl: BASE,
    clientId: env.MR_CLIENT_ID,
    clientSecret: env.MR_CLIENT_SECRET,
    fetch: countingFetch,
    ...overrides,
  });
const newAuth = ({ publicClient = false } = {}) =>
  new MiRotaractAuth({
    issuer: BASE,
    clientId: publicClient ? env.MR_PUBLIC_CLIENT_ID : env.MR_CLIENT_ID,
    clientSecret: publicClient ? undefined : env.MR_CLIENT_SECRET,
    redirectUri: env.MR_REDIRECT_URI,
    scope: SCOPE,
  });

let client;

// --- Drives the consent like the Web does (person's platform session) -----

let userToken;
async function personToken() {
  if (userToken) return userToken;
  if (env.MR_USER_EMAIL && env.MR_USER_PASSWORD) {
    const response = await fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: env.MR_USER_EMAIL,
        password: env.MR_USER_PASSWORD,
      }),
    });
    if (response.ok) return (userToken = (await response.json()).accessToken);
  }
  need("MR_USER_ACCESS_TOKEN");
  return (userToken = env.MR_USER_ACCESS_TOKEN);
}

async function authorize(auth) {
  need("MR_REDIRECT_URI");
  const request = await auth.authorizationUrl({ scope: SCOPE });
  const params = new URL(request.url).searchParams;
  const token = await personToken();
  const headers = {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
  const context = await fetch(`${BASE}/oauth/authorize/context?${params}`, {
    headers,
  });
  check(
    context.ok,
    `GET /oauth/authorize/context → ${context.status} ${await context.clone().text()}`,
  );
  const decision = await fetch(`${BASE}/oauth/authorize`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      clientId: params.get("client_id"),
      redirectUri: params.get("redirect_uri"),
      scope: params.get("scope"),
      state: params.get("state"),
      nonce: params.get("nonce"),
      codeChallenge: params.get("code_challenge"),
      codeChallengeMethod: params.get("code_challenge_method"),
      decision: "approve",
    }),
  });
  check(
    decision.ok,
    `POST /oauth/authorize → ${decision.status} ${await decision.clone().text()}`,
  );
  const { redirectTo } = await decision.json();
  const { code } = auth.parseCallback(redirectTo, { state: request.state });
  return { code, codeVerifier: request.codeVerifier, nonce: request.nonce };
}

async function login(auth = newAuth()) {
  const { code, codeVerifier, nonce } = await authorize(auth);
  return {
    auth,
    code,
    codeVerifier,
    nonce,
    result: await auth.exchangeCode({ code, codeVerifier, nonce }),
  };
}

// --- Scenarios ---------------------------------------------------------------

const scenarios = {
  async discovery() {
    const config = await newAuth().discovery();
    check(
      config.issuer.replace(/\/+$/, "") === BASE,
      `issuer ${config.issuer} != ${BASE}`,
    );
    check(
      config.token_endpoint && config.jwks_uri && config.authorization_endpoint,
      "faltan endpoints",
    );
    check(
      config.code_challenge_methods_supported?.includes("S256"),
      "sin S256",
    );
  },
  async "client_credentials.token_cached"() {
    client = newClient();
    tokenRequests = 0;
    await client.clubs.get(env.MR_ORG_ID);
    await client.clubs.get(env.MR_ORG_ID);
    check(tokenRequests === 1, `token pedido ${tokenRequests} veces`);
  },
  async "client_credentials.invalid_secret"() {
    const bad = newClient({ clientSecret: "mrs_definitely-not-the-secret" });
    await expectError(
      bad.clubs.get(env.MR_ORG_ID),
      isOAuth("invalid_client"),
      "invalid_client",
    );
  },
  async "clubs.get_in_scope"() {
    const club = await client.clubs.get(env.MR_ORG_ID);
    check(club.id === env.MR_ORG_ID, `id ${club.id}`);
  },
  async "scope.out_of_scope_org"() {
    await expectError(client.clubs.get(env.MR_OTHER_ORG_ID), isApi(403), "403");
  },
  async "permissions.check"() {
    need("MR_PERSON_ID");
    const decision = await client.permissions.check({
      personId: env.MR_PERSON_ID,
      permission: "kernel.organization.read",
      organizationId: env.MR_ORG_ID,
    });
    check(typeof decision.allowed === "boolean", "allowed no es booleano");
    check(decision.subjectId === env.MR_PERSON_ID, "subjectId distinto");
  },
  async "permissions.check_out_of_scope"() {
    need("MR_PERSON_ID");
    await expectError(
      client.permissions.check({
        personId: env.MR_PERSON_ID,
        permission: "kernel.organization.read",
        organizationId: env.MR_OTHER_ORG_ID,
      }),
      isApi(403),
      "403",
    );
  },
  async "persons.get_in_scope"() {
    need("MR_PERSON_ID");
    const person = await client.persons.get(env.MR_PERSON_ID);
    check(person.id === env.MR_PERSON_ID, `id ${person.id}`);
  },
  async "clubs.list_all_pages"() {
    const paginator = client.clubs.list({ limit: 1 });
    let pages = 0;
    const ids = [];
    for await (const page of paginator.pages()) {
      pages++;
      ids.push(...page.items.map((o) => o.id));
    }
    check(
      pages > 1 || ids.length <= 1,
      `una sola página con ${ids.length} items`,
    );
    check(ids.includes(env.MR_ORG_ID), "no incluye MR_ORG_ID");
    check(
      !ids.includes(env.MR_OTHER_ORG_ID),
      "incluye una organización fuera del alcance",
    );
  },
  async "members.pagination"() {
    let pages = 0;
    const ids = [];
    for await (const page of client.members
      .list(env.MR_ORG_ID, { limit: 2, updatedSince: "2000-01-01T00:00:00Z" })
      .pages()) {
      pages++;
      check(page.items.length <= 2, "página con más de limit items");
      ids.push(...page.items.map((m) => m.membershipId));
    }
    check(pages >= 3, `${pages} páginas`);
    check(
      ids.length >= 5 && new Set(ids).size === ids.length,
      `${ids.length} socios / repetidos`,
    );
    const future = await client.members
      .list(env.MR_ORG_ID, {
        limit: 2,
        updatedSince: new Date(Date.now() + 86_400_000),
      })
      .all();
    check(future.length === 0, `updatedSince futuro devolvió ${future.length}`);
  },
  async "members.out_of_scope"() {
    await expectError(
      client.members.list(env.MR_OTHER_ORG_ID).all(),
      isApi(403),
      "403",
    );
  },
  async "members.etag_not_modified"() {
    const first = await client.members.list(env.MR_ORG_ID).page();
    check(!first.notModified && first.etag, "la primera página no trae ETag");
    const again = await client.members
      .list(env.MR_ORG_ID, { ifNoneMatch: first.etag })
      .page();
    check(again.notModified === true, "no devolvió notModified");
    const paginator = client.members.list(env.MR_ORG_ID, {
      ifNoneMatch: first.etag,
    });
    check(
      (await paginator.all()).length === 0 && paginator.notModified,
      "el iterador produjo elementos",
    );
  },
  async "persons.batch"() {
    need("MR_PERSON_ID", "MR_OUTSIDER_PERSON_ID");
    const people = await client.persons.batch([
      env.MR_PERSON_ID,
      env.MR_OUTSIDER_PERSON_ID,
    ]);
    const ids = people.map((p) => p.id);
    check(ids.includes(env.MR_PERSON_ID), "falta MR_PERSON_ID");
    check(
      !ids.includes(env.MR_OUTSIDER_PERSON_ID),
      "incluye a la persona fuera del alcance",
    );
  },
  async "persons.memberships"() {
    need("MR_PERSON_ID");
    const memberships = await client.persons.memberships(env.MR_PERSON_ID);
    check(
      memberships.some((m) => m.organizationId === env.MR_ORG_ID),
      "sin membresía en MR_ORG_ID",
    );
  },
  async "authorities.list"() {
    const authorities = await client.authorities.list(env.MR_ORG_ID);
    check(Array.isArray(authorities), "no es lista");
  },
  async "periods.list"() {
    const periods = await client.periods.list(env.MR_ORG_ID);
    check(
      Array.isArray(periods) &&
        periods.some((p) => p.organizationId === env.MR_ORG_ID),
      "sin períodos",
    );
  },
  async "oidc.authorization_url"() {
    need("MR_REDIRECT_URI");
    const auth = newAuth();
    const request = await auth.authorizationUrl();
    const config = await auth.discovery();
    const url = new URL(request.url);
    check(
      request.url.startsWith(config.authorization_endpoint),
      "no usa authorization_endpoint",
    );
    const p = url.searchParams;
    check(p.get("response_type") === "code", "response_type");
    check(p.get("client_id") === env.MR_CLIENT_ID, "client_id");
    check(p.get("redirect_uri") === env.MR_REDIRECT_URI, "redirect_uri");
    check(p.get("code_challenge_method") === "S256", "S256");
    check(p.get("code_challenge")?.length === 43, "code_challenge");
    check(
      p.get("state") === request.state && p.get("nonce") === request.nonce,
      "state/nonce",
    );
    const other = await auth.authorizationUrl();
    check(
      other.state !== request.state &&
        other.codeVerifier !== request.codeVerifier,
      "no son aleatorios",
    );
  },
  async "oidc.code_pkce"() {
    const { result } = await login();
    check(result.claims?.sub, "sin claims");
    if (env.MR_PERSON_ID)
      check(result.claims.sub === env.MR_PERSON_ID, `sub ${result.claims.sub}`);
    check(result.refreshToken, "sin refresh token");
    check(result.accessToken && result.idToken, "faltan tokens");
  },
  async "oidc.code_reuse"() {
    const { auth, code, codeVerifier } = await login();
    await expectError(
      auth.exchangeCode({ code, codeVerifier }),
      isOAuth("invalid_grant"),
      "invalid_grant",
    );
  },
  async "oidc.verify_id_token"() {
    const { auth, nonce, result } = await login();
    const claims = await auth.verifyIdToken(result.idToken, { nonce });
    check(claims.nonce === nonce, "nonce");
    await expectError(
      auth.verifyIdToken(result.idToken, { nonce: "otro-nonce" }),
      isOAuth("invalid_token"),
      "invalid_token",
    );
  },
  async "oidc.userinfo"() {
    const { auth, result } = await login();
    const info = await auth.userInfo(result.accessToken);
    check(info.sub === result.claims.sub, "sub distinto");
    check(typeof info.email === "string", "sin email");
  },
  async "oidc.refresh_rotation"() {
    const { auth, result } = await login();
    const refreshed = await auth.refresh(result.refreshToken);
    check(
      refreshed.refreshToken && refreshed.refreshToken !== result.refreshToken,
      "no rotó",
    );
    check(refreshed.claims?.sub === result.claims.sub, "claims distintos");
    await expectError(
      auth.refresh(result.refreshToken),
      isOAuth("invalid_grant"),
      "invalid_grant (reuso)",
    );
  },
  async "oidc.revoke"() {
    const { auth, result } = await login();
    await auth.revoke(result.refreshToken);
    await expectError(
      auth.refresh(result.refreshToken),
      isOAuth("invalid_grant"),
      "invalid_grant",
    );
  },
  async "oidc.public_client"() {
    need("MR_PUBLIC_CLIENT_ID");
    const { result } = await login(newAuth({ publicClient: true }));
    const aud = Array.isArray(result.claims.aud)
      ? result.claims.aud
      : [result.claims.aud];
    check(aud.includes(env.MR_PUBLIC_CLIENT_ID), `aud ${aud}`);
  },
  async "webhooks.signature_vectors"() {
    const { vectors } = JSON.parse(
      readFileSync(new URL("./webhook-vectors.json", import.meta.url), "utf8"),
    );
    for (const vector of vectors) {
      const run = () =>
        verifyWebhook({
          payload: vector.body,
          headers: vector.headers,
          secret: vector.secret,
          toleranceSec: vector.toleranceSec,
          now: vector.now,
        });
      if (vector.expected.valid) {
        const event = await run();
        check(
          event.id === vector.expected.eventId &&
            event.type === vector.expected.type,
          `${vector.name}: evento ${event.id} ${event.type}`,
        );
      } else
        await expectError(
          run(),
          (e) =>
            e instanceof MiRotaractWebhookError &&
            e.code === vector.expected.error,
          `${vector.name}: ${vector.expected.error}`,
        );
    }
  },
  async "webhooks.event_catalog"() {
    const response = await fetch(`${BASE}/events/catalog`);
    if (response.status === 404)
      throw new MiRotaractApiError(404, { title: "Not Found" });
    check(response.ok, `HTTP ${response.status}`);
    const catalog = await response.json();
    const entry = catalog.events.find(
      (e) => e.type === "membership.activated.v1",
    );
    check(entry, "falta membership.activated.v1");
    check(
      entry.scope === "kernel.service.memberships.read",
      `scope ${entry.scope}`,
    );
    const ex = entry.example;
    check(
      /^evt_/.test(ex.id) &&
        ex.type === entry.type &&
        ex.createdAt &&
        ex.organizationId &&
        ex.data,
      "ejemplo incompleto",
    );
  },
  // --- E11 -------------------------------------------------------------------
  async "review.limited_until_approved"() {
    need("MR_REVIEW_CLIENT_ID", "MR_REVIEW_CLIENT_SECRET", "MR_PERSON_ID");
    const credentials = {
      clientId: env.MR_REVIEW_CLIENT_ID,
      clientSecret: env.MR_REVIEW_CLIENT_SECRET,
    };
    await expectError(
      newClient({ ...credentials, scope: "kernel.service.persons.read" }).clubs.get(
        env.MR_ORG_ID,
      ),
      isOAuth("invalid_scope"),
      "invalid_scope",
    );
    const limited = newClient(credentials);
    const club = await limited.clubs.get(env.MR_ORG_ID);
    check(club.id === env.MR_ORG_ID, "clubs.get");
    await expectError(
      limited.persons.get(env.MR_PERSON_ID),
      isApi(403),
      "403 (dato personal sin aprobar)",
    );
  },
  async "quota.retry_after_then_typed_error"() {
    need("MR_QUOTA_CLIENT_ID", "MR_QUOTA_CLIENT_SECRET");
    const waits = [];
    const limited = newClient({
      clientId: env.MR_QUOTA_CLIENT_ID,
      clientSecret: env.MR_QUOTA_CLIENT_SECRET,
      maxRetries: 2,
      maxRetryDelayMs: 61_000,
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    let error;
    for (let i = 0; i < 10 && !error; i++)
      await limited.clubs.get(env.MR_ORG_ID).catch((caught) => {
        error = caught;
      });
    check(error, "nunca llegó un 429 (¿cuota de 3 por minuto?)");
    check(
      error instanceof MiRotaractRateLimitError &&
        error instanceof MiRotaractApiError,
      `se esperaba MiRotaractRateLimitError, llegó ${error?.name}: ${error?.message}`,
    );
    check(
      error.status === 429 && error.code === "KERNEL_RATE_LIMITED",
      `${error.status} ${error.code}`,
    );
    check(
      error.retryAfter >= 1 && error.retryAfter <= 60,
      `retryAfter ${error.retryAfter}`,
    );
    check(/q=3/.test(error.rateLimitPolicy ?? ""), `policy ${error.rateLimitPolicy}`);
    check(waits.length === 2, `reintentos: ${waits.length}`);
    for (const wait of waits)
      check(
        wait % 1000 === 0 && wait >= 1000 && wait <= 60_000,
        `espera ${wait} ms (debería ser Retry-After)`,
      );
  },
};

// --- Runner -----------------------------------------------------------------

const results = [];
for (const scenario of spec.scenarios) {
  const run = scenarios[scenario.id];
  let status = "PASS";
  let detail = "";
  try {
    if (!run) throw new Error("escenario no implementado en este runner");
    if (!scenario.offline) {
      need(
        "MR_BASE_URL",
        "MR_CLIENT_ID",
        "MR_CLIENT_SECRET",
        "MR_ORG_ID",
        "MR_OTHER_ORG_ID",
      );
      if (!client) client = newClient();
    }
    await run();
  } catch (error) {
    if (error instanceof Skip) [status, detail] = ["SKIP", error.message];
    else if (
      scenario.requires &&
      error instanceof MiRotaractApiError &&
      error.status === 404
    )
      [status, detail] = ["PENDING", `requiere ${scenario.requires} (404)`];
    else
      [status, detail] = [
        "FAIL",
        `${error?.name ?? "Error"}: ${error?.message ?? error}`,
      ];
  }
  results.push({ id: scenario.id, status, detail });
  if (!process.argv.includes("--json"))
    console.log(
      `${status.padEnd(7)} ${scenario.id}${detail ? `  — ${detail}` : ""}`,
    );
}

const count = (s) => results.filter((r) => r.status === s).length;
const summary = {
  runner: "js",
  pass: count("PASS"),
  fail: count("FAIL"),
  pending: count("PENDING"),
  skip: count("SKIP"),
};
if (process.argv.includes("--json"))
  console.log(JSON.stringify({ summary, results }, null, 2));
else
  console.log(
    `\njs: ${summary.pass} pass, ${summary.fail} fail, ${summary.pending} pending, ${summary.skip} skip`,
  );
process.exitCode = summary.fail ? 1 : 0;
