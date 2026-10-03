import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";
import {
  createLocalJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  type JSONWebKeySet,
} from "jose";
import request from "supertest";

import {
  activateForTests,
  createTestApp,
  e2eTag,
  grantRoleForTests,
  testPrisma,
} from "./support/test-app";

/**
 * E2 against the real stack (docs/11-developer-platform-auth.md): the
 * district registers an app bound to a club, the app gets an ES256 service
 * token through client_credentials, and the Service API confines it to its
 * club; rotation, revocation and suspension cut access as specified.
 */
describe("Developer apps E2E (E2)", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let http: any;
  const tag = e2eTag();
  const password = "a-very-long-e2e-password-1";
  const base = "/api/kernel/v1";

  let admin: string;
  let rdr: string;
  let president: string;
  let districtId: string;
  let clubA: string;
  let clubB: string;
  let memberA: string;
  let memberB: string;

  async function account(label: string) {
    const email = `${tag}-${label}@example.test`;
    const registered = await request(http)
      .post(`${base}/auth/register`)
      .send({ email, password, firstName: "E2E", lastName: label })
      .expect(201);
    await activateForTests(
      prisma,
      registered.body.id,
      registered.body.personId,
    );
    return {
      personId: registered.body.personId as string,
      login: async () =>
        (
          await request(http)
            .post(`${base}/auth/login`)
            .send({ email, password })
            .expect(200)
        ).body.accessToken as string,
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
    patch: (url: string, body: object) =>
      request(http)
        .patch(`${base}${url}`)
        .set("authorization", `Bearer ${token}`)
        .set("idempotency-key", randomUUID())
        .send(body),
    delete: (url: string) =>
      request(http)
        .delete(`${base}${url}`)
        .set("authorization", `Bearer ${token}`),
  });

  async function organization(body: object) {
    const created = await as(admin).post("/organizations", body).expect(201);
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
  }

  const basic = (clientId: string, secret: string) =>
    `Basic ${Buffer.from(
      `${encodeURIComponent(clientId)}:${encodeURIComponent(secret)}`,
    ).toString("base64")}`;

  /** client_secret_basic, form-encoded like any OAuth library. */
  const tokenBasic = (clientId: string, secret: string, scope?: string) =>
    request(http)
      .post(`${base}/oauth/token`)
      .set("authorization", basic(clientId, secret))
      .type("form")
      .send({ grant_type: "client_credentials", ...(scope ? { scope } : {}) });

  /** client_secret_post. */
  const tokenPost = (clientId: string, secret?: string) =>
    request(http)
      .post(`${base}/oauth/token`)
      .type("form")
      .send({
        grant_type: "client_credentials",
        client_id: clientId,
        ...(secret ? { client_secret: secret } : {}),
      });

  const service = (token: string, url: string) =>
    request(http)
      .get(`${base}/service${url}`)
      .set("authorization", `Bearer ${token}`);

  beforeAll(async () => {
    // Request validation ON: these routes declare the Idempotency-Key
    // header in the contract. Set explicitly because process.env is shared
    // across E2E files run in band and other suites turn it off.
    process.env.KERNEL_OPENAPI_RUNTIME_VALIDATION = "true";
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
    await as(admin).post(`/organizations/${districtId}/activate`).expect(201);
    const club = (label: string) =>
      organization({
        type: "CLUB",
        code: `${label}-${tag}`,
        name: `Club ${label} ${tag}`,
        slug: `${label.toLowerCase()}-${tag}`,
        parentId: districtId,
      });
    clubA = await club("A");
    clubB = await club("B");

    const rdrAccount = await account("rdr");
    await grantRoleForTests(
      prisma,
      rdrAccount.personId,
      "DISTRICT_RDR",
      "ORGANIZATION_TREE",
      districtId,
    );
    rdr = await rdrAccount.login();

    const presidentAccount = await account("president");
    await activeMember(presidentAccount.personId, clubA);
    await grantRoleForTests(
      prisma,
      presidentAccount.personId,
      "CLUB_PRESIDENT",
      "ORGANIZATION",
      clubA,
    );
    president = await presidentAccount.login();
    memberA = presidentAccount.personId;

    const other = await account("member-b");
    await activeMember(other.personId, clubB);
    memberB = other.personId;
  });

  afterAll(async () => {
    const orgs = [clubA, clubB, districtId].filter(Boolean);
    const accounts = await prisma.userAccount.findMany({
      where: { email: { contains: tag } },
      select: { id: true, personId: true },
    });
    const personIds = accounts.map((a) => a.personId);
    // secrets, consents, codes and refresh tokens cascade with the app
    await prisma.developerApp.deleteMany({
      where: {
        OR: [
          { organizationId: { in: orgs } },
          { ownerPersonId: { in: personIds } },
        ],
      },
    });
    await prisma.roleAssignment.deleteMany({
      where: {
        OR: [{ organizationId: { in: orgs } }, { personId: { in: personIds } }],
      },
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

  const clubAppInput = () => ({
    name: `Asistencia ${tag}`,
    description: "Toma asistencia en las reuniones del club",
    type: "CONFIDENTIAL",
    organizationId: clubA,
    grantTypes: ["client_credentials"],
    scopes: [
      "kernel.service.organizations.read",
      "kernel.service.persons.read",
    ],
  });

  let clubApp: { id: string; clientId: string; secretId: string };
  let clubSecret: string;

  it("lets the RDR register a confidential app for a club and shows the secret once", async () => {
    const created = await as(rdr)
      .post("/developer/apps", {
        ...clubAppInput(),
        ownerPersonId: memberB,
        status: "SUSPENDED",
      })
      .expect(201);

    expect(created.body.clientSecret).toMatch(/^mrs_[A-Za-z0-9_-]{43}$/);
    expect(created.body.app).toMatchObject({
      clientId: expect.stringMatching(/^mra_[0-9a-f]{20}$/),
      status: "ACTIVE",
      type: "CONFIDENTIAL",
      organizationId: clubA,
      redirectUris: [],
      secrets: [
        {
          id: expect.any(String),
          hint: created.body.clientSecret.slice(-4),
        },
      ],
    });
    expect(created.body.app.ownerPersonId).not.toBe(memberB);
    expect(JSON.stringify(created.body.app)).not.toMatch(
      /secretHash|argon2|mrs_/,
    );
    clubApp = {
      id: created.body.app.id,
      clientId: created.body.app.clientId,
      secretId: created.body.app.secrets[0].id,
    };
    clubSecret = created.body.clientSecret;
    // E11: a new app starts in review; the RDR fills in the checklist data
    // and approves it, as in production.
    expect(created.body.app.reviewStatus).toBe("IN_REVIEW");
    await as(rdr)
      .patch(`/developer/apps/${clubApp.id}`, {
        purpose: "Asistencia a las reuniones del club",
        privacyPolicyUrl: "https://club.example/privacidad",
        contactEmail: "club@example.test",
      })
      .expect(200);
    await as(rdr)
      .post(`/developer/apps/${clubApp.id}/review`, {
        decision: "approve",
        checklist: {
          purpose: true,
          data: true,
          owner: true,
          privacyPolicy: true,
          contact: true,
        },
      })
      .expect(200);

    const fetched = await as(rdr)
      .get(`/developer/apps/${clubApp.id}`)
      .expect(200);
    expect(fetched.body.secrets[0]).not.toHaveProperty("secretHash");
    const listed = await as(rdr)
      .get(`/developer/apps?organizationId=${clubA}`)
      .expect(200);
    expect(listed.body.map((item: any) => item.id)).toContain(clubApp.id);

    const audit = await prisma.kernelAuditLog.findMany({
      where: { resourceId: clubApp.id },
    });
    expect(audit.map((entry) => entry.action)).toContain("createDeveloperApp");
    expect(JSON.stringify(audit)).not.toContain(clubSecret);
  });

  it("rejects invalid combinations with a 400", async () => {
    const response = await as(rdr)
      .post("/developer/apps", { ...clubAppInput(), type: "PUBLIC" })
      .expect(400);
    expect(JSON.stringify(response.body)).toMatch(/CONFIDENTIAL/);
    await as(rdr)
      .post("/developer/apps", {
        ...clubAppInput(),
        grantTypes: ["authorization_code"],
        scopes: ["openid"],
        redirectUris: ["http://evil.example.org/cb"],
      })
      .expect(400);
  });

  it("forbids a club president without kernel.app.manage", async () => {
    await as(president).post("/developer/apps", clubAppInput()).expect(403);
    await as(president)
      .get(`/developer/apps?organizationId=${clubA}`)
      .expect(403);
    await as(president)
      .post(`/developer/apps/${clubApp.id}/suspend`)
      .expect(403);
  });

  it("issues an ES256 service token published in the JWKS (basic and post)", async () => {
    const viaBasic = await tokenBasic(clubApp.clientId, clubSecret).expect(200);
    const viaPost = await tokenPost(clubApp.clientId, clubSecret).expect(200);
    expect(viaPost.body.token_type).toBe("Bearer");

    expect(viaBasic.body).toMatchObject({
      token_type: "Bearer",
      expires_in: 600,
      scope: "kernel.service.organizations.read kernel.service.persons.read",
    });
    expect(viaBasic.headers["cache-control"]).toBe("no-store");
    const header = decodeProtectedHeader(viaBasic.body.access_token);
    expect(header.alg).toBe("ES256");

    const jwks = (
      await request(http).get(`${base}/.well-known/jwks.json`).expect(200)
    ).body as JSONWebKeySet;
    expect(jwks.keys.map((key) => key.kid)).toContain(header.kid);
    const { payload } = await jwtVerify(
      viaBasic.body.access_token,
      createLocalJWKSet(jwks),
      { audience: "institutional-kernel" },
    );
    expect(payload).toMatchObject({
      sub: `app:${clubApp.clientId}`,
      client_id: clubApp.clientId,
      azp: clubApp.clientId,
      token_use: "service",
      org: clubA,
    });
    expect(payload.exp! - payload.iat!).toBe(600);
  });

  it("confines a club-bound app to its club", async () => {
    const token = (await tokenBasic(clubApp.clientId, clubSecret).expect(200))
      .body.access_token;

    await service(token, `/organizations/${clubA}`).expect(200);
    for (const outside of [clubB, districtId]) {
      const denied = await service(token, `/organizations/${outside}`).expect(
        403,
      );
      expect(JSON.stringify(denied.body)).toContain(
        "Fuera del alcance de esta app",
      );
    }
    await service(token, `/persons/${memberA}`).expect(200);
    await service(token, `/persons/${memberB}`).expect(403);
    // a scope the app was never granted
    await service(token, `/organizations/${clubA}/membership-snapshot`).expect(
      403,
    );
    const invalidScope = await tokenBasic(
      clubApp.clientId,
      clubSecret,
      "kernel.service.memberships.read",
    ).expect(400);
    expect(invalidScope.body.error).toBe("invalid_scope");
  });

  it("lets a district-bound app see its clubs", async () => {
    const created = await as(rdr)
      .post("/developer/apps", {
        ...clubAppInput(),
        name: `Distrital ${tag}`,
        organizationId: districtId,
        scopes: ["kernel.service.organizations.read"],
      })
      .expect(201);
    const token = (
      await tokenPost(
        created.body.app.clientId,
        created.body.clientSecret,
      ).expect(200)
    ).body.access_token;
    await service(token, `/organizations/${districtId}`).expect(200);
    await service(token, `/organizations/${clubB}`).expect(200);
  });

  it("no longer accepts HS256 tokens signed with JWT_SECRET", async () => {
    // A platform session token is HS256 with the right secret but not a
    // service token.
    await service(admin, `/organizations/${clubA}`).expect(401);
  });

  it("rotates secrets without cutting service and revokes the old one", async () => {
    const rotated = await as(rdr)
      .post(`/developer/apps/${clubApp.id}/secrets`)
      .expect(201);
    expect(rotated.body.secret).toMatch(/^mrs_/);
    expect(rotated.body.secret).not.toBe(clubSecret);

    await tokenBasic(clubApp.clientId, clubSecret).expect(200);
    await tokenBasic(clubApp.clientId, rotated.body.secret).expect(200);
    const detail = await as(rdr)
      .get(`/developer/apps/${clubApp.id}`)
      .expect(200);
    const old = detail.body.secrets.find(
      (secret: any) => secret.id === clubApp.secretId,
    );
    expect(old.expiresAt).not.toBeNull();
    expect(old.lastUsedAt).not.toBeNull();

    await as(rdr)
      .delete(`/developer/apps/${clubApp.id}/secrets/${clubApp.secretId}`)
      .expect(204);
    const refused = await tokenBasic(clubApp.clientId, clubSecret).expect(401);
    expect(refused.body).toEqual({ error: "invalid_client" });
    clubSecret = rotated.body.secret;
    await tokenPost(clubApp.clientId, clubSecret).expect(200);
  });

  it("cuts a suspended app off at the next request, and restores it", async () => {
    const token = (await tokenBasic(clubApp.clientId, clubSecret).expect(200))
      .body.access_token;
    await service(token, `/organizations/${clubA}`).expect(200);

    const suspended = await as(rdr)
      .post(`/developer/apps/${clubApp.id}/suspend`)
      .expect(201);
    expect(suspended.body.status).toBe("SUSPENDED");
    await service(token, `/organizations/${clubA}`).expect(401);
    const refused = await tokenBasic(clubApp.clientId, clubSecret).expect(401);
    expect(refused.body.error).toBe("invalid_client");
    await as(rdr).post(`/developer/apps/${clubApp.id}/suspend`).expect(409);

    await as(rdr).post(`/developer/apps/${clubApp.id}/activate`).expect(201);
    await service(token, `/organizations/${clubA}`).expect(200);
  });

  it("does not let a PUBLIC app use client_credentials", async () => {
    const created = await as(rdr)
      .post("/developer/apps", {
        name: `SPA ${tag}`,
        type: "PUBLIC",
        organizationId: clubA,
        grantTypes: ["authorization_code"],
        scopes: ["openid", "profile"],
        redirectUris: ["http://localhost:5173/callback"],
      })
      .expect(201);
    expect(created.body.clientSecret).toBeNull();
    expect(created.body.app.secrets).toEqual([]);
    const refused = await tokenPost(created.body.app.clientId).expect(400);
    expect(refused.body.error).toBe("unauthorized_client");
    await as(rdr)
      .post(`/developer/apps/${created.body.app.id}/secrets`)
      .expect(409);
  });

  it("revokes an app for good", async () => {
    const token = (await tokenBasic(clubApp.clientId, clubSecret).expect(200))
      .body.access_token;
    const revoked = await as(rdr)
      .post(`/developer/apps/${clubApp.id}/revoke`)
      .expect(201);
    expect(revoked.body.status).toBe("REVOKED");
    expect(
      revoked.body.secrets.every((secret: any) => secret.revokedAt !== null),
    ).toBe(true);
    await service(token, `/organizations/${clubA}`).expect(401);
    await tokenBasic(clubApp.clientId, clubSecret).expect(401);
    await as(rdr).post(`/developer/apps/${clubApp.id}/activate`).expect(409);
    await as(rdr)
      .patch(`/developer/apps/${clubApp.id}`, { name: "Otra" })
      .expect(409);
  });
});
