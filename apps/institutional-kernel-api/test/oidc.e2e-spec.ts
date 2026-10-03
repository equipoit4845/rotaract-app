import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { randomBytes, randomUUID } from "crypto";
import { createLocalJWKSet, jwtVerify, type JWTPayload } from "jose";
import request from "supertest";

import {
  hashClientSecret,
  newClientId,
  newClientSecret,
  pkceS256,
  sha256,
} from "../src/application/developer-apps/credentials";
import { SigningKeyService } from "../src/infrastructure/crypto/signing-key.service";
import {
  activateForTests,
  approveForTests,
  createTestApp,
  e2eTag,
  testPrisma,
} from "./support/test-app";

/**
 * "Ingresar con Mi Rotaract" (E3) end to end against the real stack:
 * authorization request validation, authorization code + PKCE, token
 * verification with the published JWKS, data minimization to the app's
 * organization tree, userinfo, refresh rotation with reuse detection,
 * public clients, denial and consent revocation.
 */
describe("OIDC provider E2E", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let http: any;
  const tag = e2eTag();
  const password = "a-very-long-e2e-password-1";
  const base = "/api/kernel/v1";
  const REDIRECT = "http://localhost:8765/callback";

  let admin: string;
  let districtId: string;
  let clubA: string;
  let clubB: string;
  let ana: { personId: string; accountId: string; email: string };
  let anaToken: string;
  let appointmentA: { periodId: string };
  let confidential: { id: string; clientId: string; secret: string };
  let publicApp: { id: string; clientId: string };
  const appIds: string[] = [];

  async function account(label: string) {
    const email = `${tag}-${label}@example.test`;
    const registered = await request(http)
      .post(`${base}/auth/register`)
      .send({ email, password, firstName: "Ana", lastName: label })
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
    return {
      personId: registered.body.personId as string,
      accountId: registered.body.id as string,
      email,
      login,
    };
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
    delete: (url: string) =>
      request(http)
        .delete(`${base}${url}`)
        .set("authorization", `Bearer ${token}`),
  });

  async function club(label: string) {
    const created = await as(admin)
      .post("/organizations", {
        type: "CLUB",
        code: `${label}-${tag}`,
        name: `Club ${label} ${tag}`,
        slug: `${label.toLowerCase()}-${tag}`,
        parentId: districtId,
      })
      .expect(201);
    await as(admin)
      .post(`/organizations/${created.body.id}/activate`)
      .expect(201);
    return created.body.id as string;
  }

  async function activeMember(personId: string, organizationId: string) {
    const membership = await as(admin)
      .post(`/organizations/${organizationId}/memberships`, { personId })
      .expect(201);
    await as(admin)
      .post(`/memberships/${membership.body.id}/activate`)
      .expect(201);
    return membership.body.id as string;
  }

  async function president(organizationId: string, membershipId: string) {
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
        membershipId,
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
    return { periodId: period.body.id as string };
  }

  async function createApp(
    type: "CONFIDENTIAL" | "PUBLIC",
    ownerPersonId: string,
    organizationId: string,
  ) {
    const clientId = newClientId();
    const created = await prisma.developerApp.create({
      data: {
        clientId,
        name: `${type} app ${tag}`,
        type,
        organizationId,
        ownerPersonId,
        grantTypes: ["authorization_code", "refresh_token"],
        scopes: ["openid", "profile", "email", "memberships", "positions"],
        redirectUris: [REDIRECT],
      },
    });
    appIds.push(created.id);
    await approveForTests(prisma, created.id);
    if (type === "PUBLIC") return { id: created.id, clientId, secret: "" };
    const { secret, hint } = newClientSecret();
    await prisma.developerAppSecret.create({
      data: {
        appId: created.id,
        secretHash: await hashClientSecret(secret),
        hint,
      },
    });
    return { id: created.id, clientId, secret };
  }

  function pkce() {
    const verifier = randomBytes(32).toString("base64url");
    return { verifier, challenge: pkceS256(verifier) };
  }

  function contextQuery(
    clientId: string,
    overrides: Record<string, string> = {},
  ) {
    return new URLSearchParams({
      client_id: clientId,
      redirect_uri: REDIRECT,
      scope: "openid profile email memberships positions",
      response_type: "code",
      code_challenge: pkce().challenge,
      code_challenge_method: "S256",
      ...overrides,
    }).toString();
  }

  async function authorizeCode(
    clientId: string,
    options: { scope?: string; nonce?: string; state?: string } = {},
  ) {
    const { verifier, challenge } = pkce();
    const state = options.state ?? randomUUID();
    const response = await as(anaToken)
      .post("/oauth/authorize", {
        clientId,
        redirectUri: REDIRECT,
        scope: options.scope ?? "openid profile email memberships positions",
        state,
        nonce: options.nonce ?? null,
        codeChallenge: challenge,
        codeChallengeMethod: "S256",
        decision: "approve",
      })
      .expect(200);
    const url = new URL(response.body.redirectTo);
    expect(`${url.origin}${url.pathname}`).toBe(REDIRECT);
    expect(url.searchParams.get("state")).toBe(state);
    return { code: url.searchParams.get("code")!, verifier };
  }

  function token(
    form: Record<string, string>,
    client?: { clientId: string; secret: string },
  ) {
    const call = request(http).post(`${base}/oauth/token`).type("form");
    if (client)
      call.set(
        "authorization",
        `Basic ${Buffer.from(
          `${encodeURIComponent(client.clientId)}:${encodeURIComponent(client.secret)}`,
        ).toString("base64")}`,
      );
    return call.send(form);
  }

  const exchange = (
    client: { clientId: string; secret: string },
    code: string,
    verifier: string,
  ) =>
    token(
      {
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT,
        code_verifier: verifier,
      },
      client,
    );

  const refresh = (refreshToken: string) =>
    token(
      { grant_type: "refresh_token", refresh_token: refreshToken },
      confidential,
    );

  const userinfo = (accessToken: string) =>
    request(http)
      .get(`${base}/oauth/userinfo`)
      .set("authorization", `Bearer ${accessToken}`);

  async function verifier() {
    const jwks = await request(http)
      .get(`${base}/.well-known/jwks.json`)
      .expect(200);
    const discovery = await request(http)
      .get(`${base}/.well-known/openid-configuration`)
      .expect(200);
    const keySet = createLocalJWKSet(jwks.body);
    return {
      issuer: discovery.body.issuer as string,
      verify: async (jwt: string, audience: string) =>
        (
          await jwtVerify(jwt, keySet, {
            issuer: discovery.body.issuer,
            audience,
            algorithms: ["ES256"],
          })
        ).payload as JWTPayload & Record<string, any>,
    };
  }

  beforeAll(async () => {
    app = await createTestApp();
    http = app.getHttpServer();
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
        name: `District ${tag}`,
        slug: `d-${tag}`,
      })
      .expect(201);
    districtId = district.body.id;
    clubA = await club("A");
    clubB = await club("B");

    const person = await account("person");
    ana = person;
    anaToken = await person.login();
    const membershipA = await activeMember(ana.personId, clubA);
    const membershipB = await activeMember(ana.personId, clubB);
    appointmentA = await president(clubA, membershipA);
    await president(clubB, membershipB);

    // Both apps belong to club A: they may only learn about club A.
    confidential = await createApp("CONFIDENTIAL", superadmin.personId, clubA);
    publicApp = await createApp("PUBLIC", superadmin.personId, clubA);
  });

  afterAll(async () => {
    const orgs = [clubA, clubB, districtId].filter(Boolean);
    const accounts = await prisma.userAccount.findMany({
      where: { email: { contains: tag } },
      select: { id: true, personId: true },
    });
    const personIds = accounts.map((a) => a.personId);
    // Consents, codes, refresh tokens and secrets cascade from the app.
    await prisma.developerApp.deleteMany({ where: { id: { in: appIds } } });
    await prisma.roleAssignment.deleteMany({
      where: {
        OR: [{ organizationId: { in: orgs } }, { personId: { in: personIds } }],
      },
    });
    await prisma.appointment.deleteMany({
      where: { organizationId: { in: orgs } },
    });
    await prisma.institutionalPeriod.deleteMany({
      where: { organizationId: { in: orgs } },
    });
    await prisma.membershipTransition.deleteMany({
      where: { membership: { organizationId: { in: orgs } } },
    });
    await prisma.organizationMembership.deleteMany({
      where: { organizationId: { in: orgs } },
    });
    await prisma.kernelAuditLog.deleteMany({
      where: { organizationId: { in: orgs } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [clubA, clubB].filter(Boolean) } },
    });
    await prisma.organization.deleteMany({ where: { id: districtId } });
    await prisma.accountSession.deleteMany({
      where: { accountId: { in: accounts.map((a) => a.id) } },
    });
    await prisma.userAccount.deleteMany({
      where: { id: { in: accounts.map((a) => a.id) } },
    });
    await prisma.person.deleteMany({ where: { id: { in: personIds } } });
    await prisma.$disconnect();
    await app.close();
  });

  describe("authorization request validation", () => {
    it.each([
      [
        "an unregistered redirect_uri",
        { redirect_uri: "http://localhost:9999/cb" },
      ],
      ["scopes without openid", { scope: "profile email" }],
      [
        "a scope the app was not given",
        { scope: "openid kernel.service.persons.read" },
      ],
      ["the plain PKCE method", { code_challenge_method: "plain" }],
      ["an unknown client", { client_id: "mra_00000000000000000000" }],
    ])("rejects %s with 400 and never redirects", async (_label, change) => {
      const response = await as(anaToken)
        .get(
          `/oauth/authorize/context?${contextQuery(confidential.clientId, change)}`,
        )
        .expect(400);
      expect(response.body).not.toHaveProperty("redirectTo");
    });

    it("needs a platform session", async () => {
      await request(http)
        .get(
          `${base}/oauth/authorize/context?${contextQuery(confidential.clientId)}`,
        )
        .expect(401);
    });
  });

  describe("authorization code + PKCE with a confidential client", () => {
    let refreshToken: string;
    let accessToken: string;

    it("describes the request before consent", async () => {
      const response = await as(anaToken)
        .get(`/oauth/authorize/context?${contextQuery(confidential.clientId)}`)
        .expect(200);
      expect(response.body).toMatchObject({
        app: {
          clientId: confidential.clientId,
          type: "CONFIDENTIAL",
          organizationName: `Club A ${tag}`,
        },
        alreadyGranted: false,
      });
      expect(response.body.scopes.map((s: any) => s.scope)).toEqual([
        "openid",
        "profile",
        "email",
        "memberships",
        "positions",
      ]);
    });

    it("issues tokens verifiable with the published JWKS, with minimized claims", async () => {
      const nonce = randomUUID();
      const { code, verifier: codeVerifier } = await authorizeCode(
        confidential.clientId,
        { nonce },
      );
      expect(code).toMatch(/^mrc_/);

      const response = await exchange(confidential, code, codeVerifier).expect(
        200,
      );
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.body).toMatchObject({
        token_type: "Bearer",
        expires_in: 600,
        scope: "openid profile email memberships positions",
        refresh_token: expect.stringMatching(/^mrr_/),
      });
      accessToken = response.body.access_token;
      refreshToken = response.body.refresh_token;

      const { verify, issuer } = await verifier();
      expect(issuer).toBeTruthy();
      const id = await verify(response.body.id_token, confidential.clientId);
      expect(id).toMatchObject({
        iss: issuer,
        sub: ana.personId,
        aud: confidential.clientId,
        azp: confidential.clientId,
        nonce,
        given_name: "Ana",
        family_name: "person",
        name: "Ana person",
        picture: null,
        email: ana.email,
        email_verified: true,
      });
      expect(typeof id.auth_time).toBe("number");
      // Member of clubs A and B, president of both; the app is club A's.
      expect(id.memberships).toEqual([
        {
          organizationId: clubA,
          organizationName: `Club A ${tag}`,
          organizationType: "CLUB",
          status: "ACTIVE",
        },
      ]);
      expect(id.positions).toEqual([
        {
          organizationId: clubA,
          positionCode: "CLUB_PRESIDENT",
          positionName: expect.any(String),
          periodId: appointmentA.periodId,
        },
      ]);

      const access = await verify(accessToken, "institutional-kernel");
      expect(access).toMatchObject({
        iss: issuer,
        sub: ana.personId,
        client_id: confidential.clientId,
        azp: confidential.clientId,
        token_use: "user",
        scope: "openid profile email memberships positions",
      });
    });

    it("serves userinfo with the access token", async () => {
      const response = await userinfo(accessToken).expect(200);
      expect(response.body).toMatchObject({
        sub: ana.personId,
        email: ana.email,
        memberships: [expect.objectContaining({ organizationId: clubA })],
        positions: [expect.objectContaining({ organizationId: clubA })],
      });
    });

    it("rejects userinfo without a user access token", async () => {
      const garbage = await userinfo("not-a-jwt").expect(401);
      expect(garbage.body).toEqual({ error: "invalid_token" });
      expect(garbage.headers["www-authenticate"]).toBe(
        'Bearer error="invalid_token"',
      );

      const service = await app.get(SigningKeyService).sign(
        {
          client_id: confidential.clientId,
          azp: confidential.clientId,
          token_use: "service",
          scope: "openid",
        },
        {
          audience: "institutional-kernel",
          subject: `app:${confidential.clientId}`,
          expiresIn: 60,
        },
      );
      const serviceResponse = await userinfo(service).expect(401);
      expect(serviceResponse.body).toEqual({ error: "invalid_token" });

      await request(http).get(`${base}/oauth/userinfo`).expect(401);
      // A platform session token is not an OIDC access token either.
      await userinfo(anaToken).expect(401);
    });

    it("rejects a reused code", async () => {
      const { code, verifier: codeVerifier } = await authorizeCode(
        confidential.clientId,
      );
      await exchange(confidential, code, codeVerifier).expect(200);
      const reused = await exchange(confidential, code, codeVerifier).expect(
        400,
      );
      expect(reused.body.error).toBe("invalid_grant");
    });

    it("rejects a wrong code_verifier", async () => {
      const { code } = await authorizeCode(confidential.clientId);
      const response = await exchange(
        confidential,
        code,
        pkce().verifier,
      ).expect(400);
      expect(response.body.error).toBe("invalid_grant");
    });

    it("rejects an expired code", async () => {
      const { code, verifier: codeVerifier } = await authorizeCode(
        confidential.clientId,
      );
      await prisma.oAuthAuthorizationCode.update({
        where: { codeHash: sha256(code) },
        data: { expiresAt: new Date(Date.now() - 1_000) },
      });
      const response = await exchange(confidential, code, codeVerifier).expect(
        400,
      );
      expect(response.body.error).toBe("invalid_grant");
    });

    it("rejects a wrong client secret", async () => {
      const { code, verifier: codeVerifier } = await authorizeCode(
        confidential.clientId,
      );
      const response = await exchange(
        { clientId: confidential.clientId, secret: "mrs_wrong" },
        code,
        codeVerifier,
      ).expect(401);
      expect(response.body.error).toBe("invalid_client");
    });

    it("skips the consent screen the second time", async () => {
      const response = await as(anaToken)
        .get(
          `/oauth/authorize/context?${contextQuery(confidential.clientId, {
            scope: "openid email",
          })}`,
        )
        .expect(200);
      expect(response.body.alreadyGranted).toBe(true);
    });

    it("rotates refresh tokens and detects reuse", async () => {
      const first = await refresh(refreshToken).expect(200);
      const rotated = first.body.refresh_token as string;
      expect(rotated).toMatch(/^mrr_/);
      expect(rotated).not.toBe(refreshToken);
      const { verify } = await verifier();
      await verify(first.body.id_token, confidential.clientId);
      await userinfo(first.body.access_token).expect(200);

      const narrowed = await token(
        {
          grant_type: "refresh_token",
          refresh_token: rotated,
          scope: "openid",
        },
        confidential,
      ).expect(200);
      expect(narrowed.body.scope).toBe("openid");
      const current = narrowed.body.refresh_token as string;

      const reuse = await refresh(rotated).expect(400);
      expect(reuse.body.error).toBe("invalid_grant");
      // The whole family is gone, including the newest token.
      const after = await refresh(current).expect(400);
      expect(after.body.error).toBe("invalid_grant");
    });

    it("revokes a refresh token through /oauth/revoke (RFC 7009)", async () => {
      const { code, verifier: codeVerifier } = await authorizeCode(
        confidential.clientId,
      );
      const issued = await exchange(confidential, code, codeVerifier).expect(
        200,
      );
      await request(http)
        .post(`${base}/oauth/revoke`)
        .type("form")
        .auth(confidential.clientId, confidential.secret)
        .send({ token: issued.body.refresh_token })
        .expect(200);
      const response = await refresh(issued.body.refresh_token).expect(400);
      expect(response.body.error).toBe("invalid_grant");

      await request(http)
        .post(`${base}/oauth/revoke`)
        .type("form")
        .auth(confidential.clientId, confidential.secret)
        .send({ token: "mrr_unknown" })
        .expect(200);
    });
  });

  describe("public client", () => {
    it("completes the flow with PKCE and no secret", async () => {
      const { code, verifier: codeVerifier } = await authorizeCode(
        publicApp.clientId,
        { scope: "openid profile" },
      );
      const response = await token({
        grant_type: "authorization_code",
        client_id: publicApp.clientId,
        code,
        redirect_uri: REDIRECT,
        code_verifier: codeVerifier,
      }).expect(200);
      expect(response.body.scope).toBe("openid profile");
      const { verify } = await verifier();
      const id = await verify(response.body.id_token, publicApp.clientId);
      expect(id.sub).toBe(ana.personId);
      expect(id).not.toHaveProperty("email");
      expect(id).not.toHaveProperty("memberships");
      const info = await userinfo(response.body.access_token).expect(200);
      expect(Object.keys(info.body).sort()).toEqual(
        ["family_name", "given_name", "name", "picture", "sub"].sort(),
      );
    });

    it("rejects a public client that sends a secret", async () => {
      const { code, verifier: codeVerifier } = await authorizeCode(
        publicApp.clientId,
        { scope: "openid" },
      );
      const response = await token({
        grant_type: "authorization_code",
        client_id: publicApp.clientId,
        client_secret: "mrs_anything",
        code,
        redirect_uri: REDIRECT,
        code_verifier: codeVerifier,
      }).expect(401);
      expect(response.body.error).toBe("invalid_client");
    });
  });

  it("returns access_denied with the state when the person cancels", async () => {
    const response = await as(anaToken)
      .post("/oauth/authorize", {
        clientId: confidential.clientId,
        redirectUri: REDIRECT,
        scope: "openid",
        state: "keep-me",
        codeChallenge: pkce().challenge,
        codeChallengeMethod: "S256",
        decision: "deny",
      })
      .expect(200);
    const url = new URL(response.body.redirectTo);
    expect(`${url.origin}${url.pathname}`).toBe(REDIRECT);
    expect(url.searchParams.get("error")).toBe("access_denied");
    expect(url.searchParams.get("state")).toBe("keep-me");
    expect(url.searchParams.has("code")).toBe(false);
  });

  it("stops everything once the person removes the app's access", async () => {
    const { code, verifier: codeVerifier } = await authorizeCode(
      confidential.clientId,
    );
    const issued = await exchange(confidential, code, codeVerifier).expect(200);
    await userinfo(issued.body.access_token).expect(200);

    const listed = await as(anaToken).get("/oauth/consents").expect(200);
    const consent = listed.body.find(
      (item: any) => item.appId === confidential.id,
    );
    expect(consent).toMatchObject({
      clientId: confidential.clientId,
      appName: `CONFIDENTIAL app ${tag}`,
      organizationName: `Club A ${tag}`,
      scopes: expect.arrayContaining([
        { scope: "email", label: "Tu correo electrónico" },
      ]),
    });

    await as(anaToken).delete(`/oauth/consents/${confidential.id}`).expect(204);
    await as(anaToken).delete(`/oauth/consents/${confidential.id}`).expect(404);

    const denied = await userinfo(issued.body.access_token).expect(401);
    expect(denied.body).toEqual({ error: "invalid_token" });
    const refreshed = await refresh(issued.body.refresh_token).expect(400);
    expect(refreshed.body.error).toBe("invalid_grant");

    const after = await as(anaToken).get("/oauth/consents").expect(200);
    expect(after.body.map((item: any) => item.appId)).not.toContain(
      confidential.id,
    );
    expect(after.body.map((item: any) => item.appId)).toContain(publicApp.id);

    const context = await as(anaToken)
      .get(`/oauth/authorize/context?${contextQuery(confidential.clientId)}`)
      .expect(200);
    expect(context.body.alreadyGranted).toBe(false);
  });
});
