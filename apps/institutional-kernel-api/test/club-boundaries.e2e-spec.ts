import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";
import request from "supertest";

import {
  activateForTests,
  createTestApp,
  e2eTag,
  grantRoleForTests,
  testPrisma,
} from "./support/test-app";

/**
 * What a club may and may not touch, against the real stack:
 * a president edits only their own club's descriptive data, can't detach
 * the club from its district through the generic update, and can't reach
 * another club; members get MEMBER on activation; the district (RDR) owns
 * its position catalog.
 *
 * Runs with runtime OpenAPI validation OFF, like production, so the
 * service-level allowlists are what's under test.
 */
describe("Club boundaries E2E", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let http: any;
  const tag = e2eTag();
  const password = "a-very-long-e2e-password-1";

  let admin: string;
  let districtId: string;
  let clubA: string;
  let clubB: string;

  async function account(label: string) {
    const email = `${tag}-${label}@example.test`;
    const registered = await request(http)
      .post("/api/kernel/v1/auth/register")
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
            .post("/api/kernel/v1/auth/login")
            .send({ email, password })
            .expect(200)
        ).body.accessToken as string,
    };
  }

  const as = (token: string) => ({
    get: (url: string) =>
      request(http)
        .get(`/api/kernel/v1${url}`)
        .set("authorization", `Bearer ${token}`),
    post: (url: string, body: object = {}) =>
      request(http)
        .post(`/api/kernel/v1${url}`)
        .set("authorization", `Bearer ${token}`)
        .set("idempotency-key", randomUUID())
        .send(body),
    patch: (url: string, body: object) =>
      request(http)
        .patch(`/api/kernel/v1${url}`)
        .set("authorization", `Bearer ${token}`)
        .set("idempotency-key", randomUUID())
        .send(body),
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
    await as(admin).post(`/organizations/${created.body.id}/activate`).expect(201);
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

  beforeAll(async () => {
    process.env.KERNEL_OPENAPI_RUNTIME_VALIDATION = "false";
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
  });

  afterAll(async () => {
    const orgs = [clubA, clubB, districtId].filter(Boolean);
    const accounts = await prisma.userAccount.findMany({
      where: { email: { contains: tag } },
      select: { id: true, personId: true },
    });
    const personIds = accounts.map((a) => a.personId);
    await prisma.roleAssignment.deleteMany({
      where: {
        OR: [{ organizationId: { in: orgs } }, { personId: { in: personIds } }],
      },
    });
    await prisma.rolePermission.deleteMany({
      where: { roleDefinition: { code: { contains: tag.toUpperCase() } } },
    });
    await prisma.positionDefinition.deleteMany({
      where: { ownerOrganizationId: { in: orgs } },
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
      where: { id: { in: [clubA, clubB] } },
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

  it("lets a president edit their club's data but never detach it from the district", async () => {
    const president = await account("president-a");
    await activeMember(president.personId, clubA);
    await grantRoleForTests(
      prisma,
      president.personId,
      "CLUB_PRESIDENT",
      "ORGANIZATION",
      clubA,
    );
    const token = await president.login();

    await as(token)
      .patch(`/organizations/${clubA}`, {
        name: `Renamed ${tag}`,
        parentId: null,
        type: "DISTRICT",
        status: "ARCHIVED",
      })
      .expect(200);

    const stored = await prisma.organization.findUniqueOrThrow({
      where: { id: clubA },
    });
    expect(stored.name).toBe(`Renamed ${tag}`);
    expect(stored.parentId).toBe(districtId);
    expect(stored.type).toBe("CLUB");
    expect(stored.status).toBe("ACTIVE");

    await as(token)
      .patch(`/organizations/${clubB}`, { name: "Hijacked" })
      .expect(403);
    await as(token)
      .patch(`/organizations/${districtId}`, { name: "Hijacked" })
      .expect(403);
  });

  it("gives an activated member MEMBER in their own club only", async () => {
    const member = await account("member-a");
    await activeMember(member.personId, clubA);
    const token = await member.login();

    await as(token).get(`/organizations/${clubA}/memberships`).expect(200);
    await as(token).get(`/organizations/${clubB}/memberships`).expect(403);
  });

  it("lets the district RDR manage its own position catalog, and not a club", async () => {
    const rdr = await account("rdr");
    await grantRoleForTests(
      prisma,
      rdr.personId,
      "DISTRICT_RDR",
      "ORGANIZATION_TREE",
      districtId,
    );
    const rdrToken = await rdr.login();

    const position = await as(rdrToken)
      .post("/position-definitions", {
        code: `DISTRICT_COORD_${tag.toUpperCase()}`,
        name: "Coordinación distrital",
        organizationType: "DISTRICT",
        ownerOrganizationId: districtId,
        editPermissionCode: "kernel.position.manage",
      })
      .expect(201);
    await as(rdrToken)
      .get(`/position-definitions/${position.body.id}/permissions`)
      .expect(200)
      .expect((res) => {
        if (!Array.isArray(res.body)) throw new Error("expected an array");
      });

    const president = await account("president-b");
    await activeMember(president.personId, clubB);
    await grantRoleForTests(
      prisma,
      president.personId,
      "CLUB_PRESIDENT",
      "ORGANIZATION",
      clubB,
    );
    await as(await president.login())
      .post("/position-definitions", {
        code: `DISTRICT_FAKE_${tag.toUpperCase()}`,
        name: "Cargo falso",
        organizationType: "DISTRICT",
        ownerOrganizationId: districtId,
        editPermissionCode: "kernel.position.manage",
      })
      .expect(403);
  });
});
