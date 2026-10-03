import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { randomBytes, randomUUID } from "crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import request from "supertest";

import { pkceS256 } from "../src/application/developer-apps/credentials";
import { AccessHistoryWriter } from "../src/application/governance/access-history.writer";
import { OpenApiValidationService } from "../src/interfaces/http/openapi-validation.service";
import {
  activateForTests,
  approveForTests,
  createTestApp,
  e2eTag,
  grantRoleForTests,
  testPrisma,
} from "./support/test-app";

/**
 * E11 — data governance end to end (docs/18-data-governance.md):
 *  - E11.1 a new app is limited while in review; the RDR approves it with
 *    the checklist and it gets full access; rejection and re-review;
 *  - E11.2 a member sees their own access history (and nobody else's),
 *    revokes access, and the app's refresh token stops working;
 *  - E11.3 an app over its quota gets 429 + Retry-After + RateLimit, and
 *    the JS SDK retries honoring Retry-After, then surfaces a typed error;
 *  - E11.4 the RDR publishes an approved app for club presidents: a
 *    president sees it in /me/apps, a plain member doesn't; suspending the
 *    app hides it.
 */
describe("Data governance E2E (E11)", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let http: any;
  let baseUrl: string;
  let previousIssuer: string | undefined;
  const tag = e2eTag();
  const password = "a-very-long-e2e-password-1";
  const base = "/api/kernel/v1";
  const REDIRECT = "http://localhost:8765/callback";
  const CHECKLIST = {
    purpose: true,
    data: true,
    owner: true,
    privacyPolicy: true,
    contact: true,
  };

  let admin: string;
  let districtId: string;
  let clubA: string;
  let rdr: string;
  let rdrPersonId: string;
  let member: { personId: string; email: string; token: string };
  let president: { personId: string; token: string };

  let reviewed: { id: string; clientId: string; secret: string; body: any };
  let memberSession: { accessToken: string; refreshToken: string };

  async function account(label: string) {
    const email = `${tag}-${label}@example.test`;
    const registered = await request(http)
      .post(`${base}/auth/register`)
      .send({ email, password, firstName: label, lastName: tag })
      .expect(201);
    await activateForTests(
      prisma,
      registered.body.id,
      registered.body.personId,
    );
    const login = async () =>
      (
        await request(http)
          .post(`${base}/auth/login`)
          .send({ email, password })
          .expect(200)
      ).body.accessToken as string;
    return { personId: registered.body.personId as string, email, login };
  }

  const as = (token: string) => ({
    get: (url: string) =>
      request(http)
        .get(`${base}${url}`)
        .set("authorization", `Bearer ${token}`),
    post: (url: string, body: object = {}) =>
      request(http)
        .post(`${base}${url}`)
        .set("authorization", `Bearer ${token}`)
        .set("idempotency-key", randomUUID())
        .send(body),
    patch: (url: string, body: object) =>
      request(http)
        .patch(`${base}${url}`)
        .set("authorization", `Bearer ${token}`)
        .set("idempotency-key", randomUUID())
        .send(body),
    put: (url: string, body: object) =>
      request(http)
        .put(`${base}${url}`)
        .set("authorization", `Bearer ${token}`)
        .send(body),
    delete: (url: string) =>
      request(http)
        .delete(`${base}${url}`)
        .set("authorization", `Bearer ${token}`),
  });

  const basic = (clientId: string, secret: string) =>
    `Basic ${Buffer.from(
      `${encodeURIComponent(clientId)}:${encodeURIComponent(secret)}`,
    ).toString("base64")}`;

  const token = (
    client: { clientId: string; secret: string },
    form: Record<string, string>,
  ) =>
    request(http)
      .post(`${base}/oauth/token`)
      .set("authorization", basic(client.clientId, client.secret))
      .type("form")
      .send(form);

  const service = (accessToken: string, url: string) =>
    request(http)
      .get(`${base}/service${url}`)
      .set("authorization", `Bearer ${accessToken}`);

  function pkce() {
    const verifier = randomBytes(32).toString("base64url");
    return { verifier, challenge: pkceS256(verifier) };
  }

  const contextQuery = (clientId: string, scope = "openid profile") =>
    new URLSearchParams({
      client_id: clientId,
      redirect_uri: REDIRECT,
      scope,
      response_type: "code",
      code_challenge: pkce().challenge,
      code_challenge_method: "S256",
    }).toString();

  async function signIn(
    userToken: string,
    client: { clientId: string; secret: string },
  ) {
    const { verifier, challenge } = pkce();
    const authorized = await as(userToken)
      .post("/oauth/authorize", {
        clientId: client.clientId,
        redirectUri: REDIRECT,
        scope: "openid profile",
        state: "s",
        codeChallenge: challenge,
        codeChallengeMethod: "S256",
        decision: "approve",
      })
      .expect(200);
    const code = new URL(authorized.body.redirectTo).searchParams.get("code")!;
    const tokens = await token(client, {
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      code_verifier: verifier,
    }).expect(200);
    return {
      accessToken: tokens.body.access_token as string,
      refreshToken: tokens.body.refresh_token as string,
    };
  }

  async function createApp(
    userToken: string,
    body: Record<string, unknown>,
  ): Promise<{ id: string; clientId: string; secret: string; body: any }> {
    const created = await as(userToken)
      .post("/developer/apps", {
        name: `Gobierno ${tag}`,
        type: "CONFIDENTIAL",
        organizationId: districtId,
        grantTypes: [
          "client_credentials",
          "authorization_code",
          "refresh_token",
        ],
        scopes: [
          "openid",
          "profile",
          "kernel.service.organizations.read",
          "kernel.service.persons.read",
        ],
        redirectUris: [REDIRECT],
        ...body,
      })
      .expect(201);
    return {
      id: created.body.app.id,
      clientId: created.body.app.clientId,
      secret: created.body.clientSecret,
      body: created.body.app,
    };
  }

  // Response validation can't be on for the whole suite (older endpoints
  // used in the setup still have known contract gaps), so every E11
  // response is checked against kernel-openapi.yaml here.
  const contract = new OpenApiValidationService();
  function conforms<T extends request.Response>(response: T): T {
    const req = (
      response as unknown as { req: { method: string; path: string } }
    ).req;
    const path = new URL(req.path, "http://kernel").pathname;
    const operation = contract.operation(req.method, path);
    expect(operation).toBeDefined();
    contract.validateResponse(operation!, response.status, response.body);
    return response;
  }

  async function flushHistory() {
    await app.get(AccessHistoryWriter).flush();
  }

  async function appointPresident(organizationId: string, personId: string) {
    const membership = await as(admin)
      .post(`/organizations/${organizationId}/memberships`, { personId })
      .expect(201);
    await as(admin)
      .post(`/memberships/${membership.body.id}/activate`)
      .expect(201);
    const period = await as(admin)
      .post(`/organizations/${organizationId}/periods`, {
        code: `P-${tag}`,
        name: "2026-2027",
        sequence: 1,
        startDate: "2026-07-01",
        endDate: "2027-06-30",
      })
      .expect(201);
    await as(admin).post(`/periods/${period.body.id}/schedule`).expect(201);
    await as(admin).post(`/periods/${period.body.id}/activate`).expect(201);
    const presidency = await prisma.positionDefinition.findUniqueOrThrow({
      where: { code: "CLUB_PRESIDENT" },
    });
    const appointment = await as(admin)
      .post(`/organizations/${organizationId}/appointments`, {
        membershipId: membership.body.id,
        periodId: period.body.id,
        positionDefinitionId: presidency.id,
      })
      .expect(201);
    await as(admin)
      .post(`/appointments/${appointment.body.id}/elect`)
      .expect(201);
    await as(admin)
      .post(`/appointments/${appointment.body.id}/activate`)
      .expect(201);
  }

  /** Quotas use the UTC minute: don't start a counting test near its end. */
  async function awayFromMinuteEdge() {
    const second = new Date().getUTCSeconds();
    if (second > 45)
      await new Promise((done) => setTimeout(done, (61 - second) * 1_000));
  }

  beforeAll(async () => {
    process.env.KERNEL_OPENAPI_RUNTIME_VALIDATION = "true";
    app = await createTestApp();
    await app.listen(0, "127.0.0.1");
    http = app.getHttpServer();
    baseUrl = `http://127.0.0.1:${(http.address() as { port: number }).port}${base}`;
    // The SDK checks that discovery declares the issuer it was given.
    previousIssuer = process.env.KERNEL_ISSUER_URL;
    process.env.KERNEL_ISSUER_URL = baseUrl;
    prisma = testPrisma();

    const superadmin = await account("admin");
    await prisma.userAccount.updateMany({
      where: { personId: superadmin.personId },
      data: { platformRole: "SUPERADMIN" },
    });
    admin = await superadmin.login();
    const district = await as(admin)
      .post("/organizations", {
        type: "DISTRICT",
        code: `D-${tag}`,
        name: `Distrito ${tag}`,
        slug: `d-${tag}`,
      })
      .expect(201);
    districtId = district.body.id;
    await as(admin).post(`/organizations/${districtId}/activate`).expect(201);
    const club = await as(admin)
      .post("/organizations", {
        type: "CLUB",
        code: `A-${tag}`,
        name: `Club A ${tag}`,
        slug: `a-${tag}`,
        parentId: districtId,
      })
      .expect(201);
    clubA = club.body.id;
    await as(admin).post(`/organizations/${clubA}/activate`).expect(201);

    const rdrAccount = await account("rdr");
    rdrPersonId = rdrAccount.personId;
    await grantRoleForTests(
      prisma,
      rdrAccount.personId,
      "DISTRICT_RDR",
      "ORGANIZATION_TREE",
      districtId,
    );
    rdr = await rdrAccount.login();

    const memberAccount = await account("member");
    const membership = await as(admin)
      .post(`/organizations/${clubA}/memberships`, {
        personId: memberAccount.personId,
      })
      .expect(201);
    await as(admin)
      .post(`/memberships/${membership.body.id}/activate`)
      .expect(201);
    member = {
      personId: memberAccount.personId,
      email: memberAccount.email,
      token: await memberAccount.login(),
    };

    const presidentAccount = await account("president");
    await appointPresident(clubA, presidentAccount.personId);
    president = {
      personId: presidentAccount.personId,
      token: await presidentAccount.login(),
    };
  });

  afterAll(async () => {
    if (previousIssuer === undefined) delete process.env.KERNEL_ISSUER_URL;
    else process.env.KERNEL_ISSUER_URL = previousIssuer;
    await prisma.$disconnect();
    await app.close();
  });

  // --- E11.1 ---------------------------------------------------------------

  it("starts a new app in review: only safe data and only its owner and testers", async () => {
    reviewed = await createApp(rdr, {});
    expect(reviewed.body).toMatchObject({
      reviewStatus: "IN_REVIEW",
      approvedScopes: [],
      approvedAt: null,
    });

    const queue = conforms(
      await as(rdr)
        .get(`/developer/app-reviews?organizationId=${districtId}`)
        .expect(200),
    );
    const item = queue.body.find((row: any) => row.appId === reviewed.id);
    expect(item).toMatchObject({
      ownerPersonId: rdrPersonId,
      purpose: null,
      privacyPolicyUrl: null,
    });
    expect(item.pendingScopes).toHaveLength(4);
    // Reviewing is the RDR's: a club president can't see the queue.
    await as(president.token)
      .get(`/developer/app-reviews?organizationId=${districtId}`)
      .expect(403);

    // Service token: only data without personal information.
    const limited = await token(reviewed, {
      grant_type: "client_credentials",
    }).expect(200);
    expect(limited.body.scope).toBe("kernel.service.organizations.read");
    const refused = await token(reviewed, {
      grant_type: "client_credentials",
      scope: "kernel.service.persons.read",
    }).expect(400);
    expect(refused.body.error).toBe("invalid_scope");
    await service(
      limited.body.access_token,
      `/persons/${member.personId}`,
    ).expect(403);

    // Sign-in: a member who is not a tester is kept out, in plain Spanish.
    const blocked = await as(member.token)
      .get(`/oauth/authorize/context?${contextQuery(reviewed.clientId)}`)
      .expect(400);
    expect(blocked.body.detail).toMatch(/revisión del distrito/);
    // The owner can test it, and so can a test account.
    await as(rdr)
      .get(`/oauth/authorize/context?${contextQuery(reviewed.clientId)}`)
      .expect(200);
    await as(rdr)
      .patch(`/developer/apps/${reviewed.id}`, {
        testAccountEmails: [member.email.toUpperCase()],
      })
      .expect(200);
    await as(member.token)
      .get(`/oauth/authorize/context?${contextQuery(reviewed.clientId)}`)
      .expect(200);
    await as(rdr)
      .patch(`/developer/apps/${reviewed.id}`, { testAccountEmails: [] })
      .expect(200);
  });

  it("lets the RDR approve only with the whole checklist; then everything works", async () => {
    const missing = await as(rdr)
      .post(`/developer/apps/${reviewed.id}/review`, {
        decision: "approve",
        checklist: CHECKLIST,
      })
      .expect(400);
    expect(missing.body.detail).toMatch(/propósito/);

    await as(rdr)
      .patch(`/developer/apps/${reviewed.id}`, {
        purpose: "Agenda de reuniones del distrito",
        privacyPolicyUrl: "https://reuniones.example/privacidad",
        contactEmail: "Equipo@Reuniones.example",
      })
      .expect(200);
    await as(rdr)
      .post(`/developer/apps/${reviewed.id}/review`, {
        decision: "approve",
        checklist: { ...CHECKLIST, privacyPolicy: false },
      })
      .expect(400);
    const approved = conforms(
      await as(rdr)
        .post(`/developer/apps/${reviewed.id}/review`, {
          decision: "approve",
          checklist: CHECKLIST,
        })
        .expect(200),
    );
    expect(approved.body).toMatchObject({
      kind: "APPROVED",
      actorPersonId: rdrPersonId,
      checklist: CHECKLIST,
    });
    // Approving twice is a state error.
    await as(rdr)
      .post(`/developer/apps/${reviewed.id}/review`, {
        decision: "approve",
        checklist: CHECKLIST,
      })
      .expect(409);

    const detail = conforms(
      await as(rdr).get(`/developer/apps/${reviewed.id}`).expect(200),
    );
    expect(detail.body).toMatchObject({
      reviewStatus: "APPROVED",
      contactEmail: "equipo@reuniones.example",
    });
    expect(detail.body.approvedScopes).toHaveLength(4);
    const history = conforms(
      await as(rdr).get(`/developer/apps/${reviewed.id}/reviews`).expect(200),
    );
    expect(history.body.map((row: any) => row.kind)).toEqual([
      "APPROVED",
      "SUBMITTED",
    ]);
    expect(
      await prisma.kernelAuditLog.count({
        where: { action: "approveDeveloperApp", resourceId: reviewed.id },
      }),
    ).toBe(1);

    const full = await token(reviewed, {
      grant_type: "client_credentials",
    }).expect(200);
    expect(full.body.scope).toBe(
      "kernel.service.organizations.read kernel.service.persons.read",
    );
    await service(full.body.access_token, `/persons/${member.personId}`).expect(
      200,
    );
    memberSession = await signIn(member.token, reviewed);
    await request(http)
      .get(`${base}/oauth/userinfo`)
      .set("authorization", `Bearer ${memberSession.accessToken}`)
      .expect(200);
  });

  it("reopens the review for new data while approved data keeps working", async () => {
    const edited = await as(rdr)
      .patch(`/developer/apps/${reviewed.id}`, {
        scopes: [
          "openid",
          "profile",
          "email",
          "kernel.service.organizations.read",
          "kernel.service.persons.read",
        ],
      })
      .expect(200);
    expect(edited.body.reviewStatus).toBe("IN_REVIEW");
    await as(member.token)
      .get(`/oauth/authorize/context?${contextQuery(reviewed.clientId)}`)
      .expect(200);
    await as(member.token)
      .get(
        `/oauth/authorize/context?${contextQuery(reviewed.clientId, "openid email")}`,
      )
      .expect(400);
    // Dropping the new data again leaves it approved, without a review.
    const back = await as(rdr)
      .patch(`/developer/apps/${reviewed.id}`, {
        scopes: [
          "openid",
          "profile",
          "kernel.service.organizations.read",
          "kernel.service.persons.read",
        ],
      })
      .expect(200);
    expect(back.body.reviewStatus).toBe("APPROVED");
  });

  it("rejects with a reason the team reads, and takes a new request", async () => {
    const other = await createApp(rdr, { name: `Rechazada ${tag}` });
    await as(rdr)
      .post(`/developer/apps/${other.id}/review`, {
        decision: "reject",
        checklist: {},
        reason: "no",
      })
      .expect(400);
    const rejected = await as(rdr)
      .post(`/developer/apps/${other.id}/review`, {
        decision: "reject",
        checklist: { purpose: true },
        reason: "Falta la política de privacidad y explicar el uso del correo",
      })
      .expect(200);
    expect(rejected.body.kind).toBe("REJECTED");
    expect(
      (await as(rdr).get(`/developer/apps/${other.id}`).expect(200)).body
        .reviewStatus,
    ).toBe("REJECTED");
    // A rejected app still can't sign in members nor be published.
    await as(member.token)
      .get(`/oauth/authorize/context?${contextQuery(other.clientId)}`)
      .expect(400);
    await as(rdr)
      .put(`/developer/apps/${other.id}/listing`, {
        published: true,
        audiences: ["DISTRICT_MEMBERS"],
        launchUrl: "https://rechazada.example",
      })
      .expect(409);
    const again = conforms(
      await as(rdr)
        .post(`/developer/apps/${other.id}/review-request`)
        .expect(200),
    );
    expect(again.body.reviewStatus).toBe("IN_REVIEW");
  });

  // --- E11.2 ---------------------------------------------------------------

  it("shows a member their own access history, and nobody else's", async () => {
    await flushHistory();
    const mine = conforms(
      await as(member.token).get("/me/app-access").expect(200),
    );
    const entry = mine.body.find((row: any) => row.appId === reviewed.id);
    expect(entry).toMatchObject({
      connected: true,
      appStatus: "ACTIVE",
      organizationName: `Distrito ${tag}`,
    });
    expect(entry.accessCount).toBeGreaterThanOrEqual(4);
    const events = conforms(
      await as(member.token).get(`/me/app-access/${reviewed.id}`).expect(200),
    );
    const kinds = events.body.items.map((row: any) => row.kind);
    expect(kinds).toEqual(
      expect.arrayContaining([
        "CONSENT_GRANTED",
        "SIGN_IN",
        "USERINFO",
        "DATA_READ",
      ]),
    );
    const read = events.body.items.find((row: any) => row.kind === "DATA_READ");
    expect(read.details).toEqual(["person"]);
    expect(read.description).toMatch(/Leyó tus datos/);
    // Pagination works with the person's own cursor only.
    const page = await as(member.token)
      .get(`/me/app-access/${reviewed.id}?limit=1`)
      .expect(200);
    expect(page.body.pageInfo.hasMore).toBe(true);
    await as(president.token)
      .get(
        `/me/app-access/${reviewed.id}?cursor=${page.body.pageInfo.nextCursor}`,
      )
      .expect(400);

    // Another person sees nothing of the member's history.
    const theirs = await as(president.token)
      .get(`/me/app-access/${reviewed.id}`)
      .expect(200);
    expect(theirs.body.items).toEqual([]);
    const theirApps = await as(president.token)
      .get("/me/app-access")
      .expect(200);
    expect(theirApps.body.map((row: any) => row.appId)).not.toContain(
      reviewed.id,
    );
  });

  it("revokes access: the app's refresh token and access token stop working", async () => {
    await as(member.token).delete(`/oauth/consents/${reviewed.id}`).expect(204);
    const refreshed = await token(reviewed, {
      grant_type: "refresh_token",
      refresh_token: memberSession.refreshToken,
    }).expect(400);
    expect(refreshed.body.error).toBe("invalid_grant");
    await request(http)
      .get(`${base}/oauth/userinfo`)
      .set("authorization", `Bearer ${memberSession.accessToken}`)
      .expect(401);

    await flushHistory();
    const events = await as(member.token)
      .get(`/me/app-access/${reviewed.id}`)
      .expect(200);
    expect(events.body.items[0].kind).toBe("CONSENT_REVOKED");
    const mine = await as(member.token).get("/me/app-access").expect(200);
    expect(
      mine.body.find((row: any) => row.appId === reviewed.id).connected,
    ).toBe(false);
    expect(
      await prisma.kernelAuditLog.count({
        where: {
          action: "revokeOAuthConsent",
          resourceId: reviewed.id,
          actorId: member.personId,
        },
      }),
    ).toBe(1);
  });

  // --- E11.3 ---------------------------------------------------------------

  it("answers 429 with Retry-After and RateLimit headers past the app's quota", async () => {
    const limited = await createApp(rdr, { name: `Cuota ${tag}` });
    await approveForTests(prisma, limited.id);
    // The quota is the RDR's to set; a president can't.
    await as(president.token)
      .put(`/developer/apps/${limited.id}/quota`, { perMinute: 3 })
      .expect(403);
    const set = conforms(
      await as(rdr)
        .put(`/developer/apps/${limited.id}/quota`, {
          perMinute: 3,
          perDay: 1000,
        })
        .expect(200),
    );
    expect(set.body).toMatchObject({
      source: "custom",
      perMinute: { limit: 3 },
      perDay: { limit: 1000 },
    });

    await awayFromMinuteEdge();
    const issued = await token(limited, {
      grant_type: "client_credentials",
    }).expect(200); // 1
    expect(issued.headers["ratelimit-policy"]).toBe(
      '"minute";q=3;w=60, "day";q=1000;w=86400',
    );
    const ok = await service(
      issued.body.access_token,
      `/organizations/${clubA}`,
    ).expect(200); // 2
    expect(ok.headers.ratelimit).toMatch(
      /^"minute";r=1;t=\d+, "day";r=998;t=\d+$/,
    );
    await service(issued.body.access_token, `/organizations/${clubA}`).expect(
      200,
    ); // 3
    const refused = await service(
      issued.body.access_token,
      `/organizations/${clubA}`,
    ).expect(429);
    expect(refused.body).toMatchObject({
      status: 429,
      code: "KERNEL_RATE_LIMITED",
    });
    const retryAfter = Number(refused.headers["retry-after"]);
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(60);
    expect(refused.headers.ratelimit).toMatch(/^"minute";r=0;/);

    const usage = conforms(
      await as(rdr).get(`/developer/apps/${limited.id}/quota`).expect(200),
    );
    expect(usage.body.perMinute).toMatchObject({ limit: 3, remaining: 0 });
    expect(usage.body.perMinute.used).toBeGreaterThanOrEqual(4);
    expect(
      await prisma.kernelAuditLog.count({
        where: { action: "updateDeveloperAppQuota", resourceId: limited.id },
      }),
    ).toBe(1);
  });

  it("the JS SDK retries honoring Retry-After, then throws MiRotaractRateLimitError", async () => {
    const limited = await createApp(rdr, { name: `SDK cuota ${tag}` });
    await approveForTests(prisma, limited.id);
    await as(rdr)
      .put(`/developer/apps/${limited.id}/quota`, { perMinute: 2 })
      .expect(200);
    const importEsm = new Function("specifier", "return import(specifier)") as (
      specifier: string,
    ) => Promise<any>;
    const sdk = await importEsm(
      pathToFileURL(
        resolve(__dirname, "../../../packages/sdk-js/dist/esm/index.js"),
      ).href,
    );
    const waits: number[] = [];
    const client = new sdk.MiRotaract({
      baseUrl,
      clientId: limited.clientId,
      clientSecret: limited.secret,
      maxRetries: 2,
      maxRetryDelayMs: 61_000,
      // Record the waits instead of sleeping through them.
      sleep: async (ms: number) => {
        waits.push(ms);
      },
    });
    await awayFromMinuteEdge();
    await expect(client.clubs.get(clubA)).resolves.toMatchObject({ id: clubA }); // token + read
    const error = await client.clubs
      .get(clubA)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(sdk.MiRotaractRateLimitError);
    expect(error).toBeInstanceOf(sdk.MiRotaractApiError);
    expect(error).toMatchObject({ status: 429, code: "KERNEL_RATE_LIMITED" });
    expect(error.retryAfter).toBeGreaterThanOrEqual(1);
    expect(error.rateLimitPolicy).toContain('"minute";q=2;w=60');
    // Two retries, each waiting what the Kernel asked for (seconds → ms).
    expect(waits).toHaveLength(2);
    for (const wait of waits) {
      expect(wait % 1000).toBe(0);
      expect(wait).toBeGreaterThanOrEqual(error.retryAfter * 1000);
    }
  });

  // --- E11.4 ---------------------------------------------------------------

  it("publishes an approved app for club presidents and hides it when suspended", async () => {
    const catalog = conforms(
      await as(rdr)
        .get(`/developer/app-catalog?organizationId=${districtId}`)
        .expect(200),
    );
    const suggestion = catalog.body.find(
      (row: any) => row.appId === reviewed.id,
    );
    expect(suggestion).toMatchObject({
      saved: false,
      listing: {
        published: false,
        displayName: `Gobierno ${tag}`,
        launchUrl: "http://localhost:8765",
        audiences: [],
      },
    });
    await as(president.token)
      .get(`/developer/app-catalog?organizationId=${districtId}`)
      .expect(403);
    await as(rdr)
      .put(`/developer/apps/${reviewed.id}/listing`, { published: true })
      .expect(400); // no audience yet

    const published = await as(rdr)
      .put(`/developer/apps/${reviewed.id}/listing`, {
        published: true,
        displayName: "Reuniones",
        shortDescription: "Actas y asistencia de tu club",
        icon: "calendar-days",
        launchUrl: "https://reuniones.example",
        audiences: ["CLUB_PRESIDENTS", "DISTRICT_AUTHORITIES"],
        displayOrder: 10,
      })
      .expect(200);
    conforms(published);
    expect(published.body).toMatchObject({
      published: true,
      audiences: ["CLUB_PRESIDENTS", "DISTRICT_AUTHORITIES"],
    });

    const presidentApps = conforms(
      await as(president.token).get("/me/apps").expect(200),
    );
    const mine = presidentApps.body.find(
      (row: any) => row.appId === reviewed.id,
    );
    expect(mine).toEqual({
      appId: reviewed.id,
      name: "Reuniones",
      description: "Actas y asistencia de tu club",
      icon: "calendar-days",
      launchUrl: "https://reuniones.example",
    });
    const memberApps = await as(member.token).get("/me/apps").expect(200);
    expect(memberApps.body.map((row: any) => row.appId)).not.toContain(
      reviewed.id,
    );

    await as(rdr).post(`/developer/apps/${reviewed.id}/suspend`).expect(201);
    const afterSuspend = await as(president.token).get("/me/apps").expect(200);
    expect(afterSuspend.body.map((row: any) => row.appId)).not.toContain(
      reviewed.id,
    );
    const listing = await prisma.developerAppListing.findUniqueOrThrow({
      where: { appId: reviewed.id },
    });
    expect(listing.published).toBe(false);
    const actions = (
      await prisma.kernelAuditLog.findMany({
        where: {
          resourceId: reviewed.id,
          action: { in: ["publishDeveloperApp", "unpublishDeveloperApp"] },
        },
        orderBy: { occurredAt: "asc" },
      })
    ).map((row) => row.action);
    expect(actions).toEqual(["publishDeveloperApp", "unpublishDeveloperApp"]);
    // Reactivating does not republish by itself.
    await as(rdr).post(`/developer/apps/${reviewed.id}/activate`).expect(201);
    const afterActivate = await as(president.token).get("/me/apps").expect(200);
    expect(afterActivate.body.map((row: any) => row.appId)).not.toContain(
      reviewed.id,
    );
  });
});
