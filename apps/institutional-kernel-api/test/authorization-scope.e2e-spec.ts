import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";
import request from "supertest";

import {
  createTestApp,
  e2eTag,
  testPrisma,
  activateForTests,
  grantRoleForTests,
} from "./support/test-app";

/**
 * Regression coverage for the WS1 authorization bug (organizationId
 * resolution for id-only mutation routes) and the WS10 ".self" ownership
 * enforcement — both were only caught, originally, by manual testing
 * against this same live stack. This suite automates that verification.
 */
describe("Authorization scope E2E", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let http: any;
  const tag = e2eTag();

  let superAdminAccountId: string;
  let superAdminPersonId: string;
  let superAdminToken: string;
  let districtId: string;
  let clubId: string;

  async function registerAndActivate(label: string) {
    const email = `${tag}-${label}@example.test`;
    const password = "a-very-long-e2e-password-1";
    const registered = await request(http)
      .post("/api/kernel/v1/auth/register")
      .send({ email, password, firstName: "E2E", lastName: label })
      .expect(201);
    await activateForTests(prisma, registered.body.id, registered.body.personId);
    const login = await request(http)
      .post("/api/kernel/v1/auth/login")
      .send({ email, password })
      .expect(200);
    return {
      accountId: registered.body.id as string,
      personId: registered.body.personId as string,
      token: login.body.accessToken as string,
    };
  }

  beforeAll(async () => {
    app = await createTestApp();
    http = app.getHttpServer();
    prisma = testPrisma();

    const admin = await registerAndActivate("admin");
    superAdminAccountId = admin.accountId;
    superAdminPersonId = admin.personId;
    await prisma.userAccount.update({
      where: { id: superAdminAccountId },
      data: { platformRole: "SUPERADMIN" },
    });
    const relogin = await request(http)
      .post("/api/kernel/v1/auth/login")
      .send({
        email: `${tag}-admin@example.test`,
        password: "a-very-long-e2e-password-1",
      })
      .expect(200);
    superAdminToken = relogin.body.accessToken;

    const district = await request(http)
      .post("/api/kernel/v1/organizations")
      .set("authorization", `Bearer ${superAdminToken}`)
      .set("idempotency-key", randomUUID())
      .send({
        type: "DISTRICT",
        code: `D-${tag}`,
        name: `District ${tag}`,
        slug: `d-${tag}`,
      })
      .expect(201);
    districtId = district.body.id;

    const club = await request(http)
      .post("/api/kernel/v1/organizations")
      .set("authorization", `Bearer ${superAdminToken}`)
      .set("idempotency-key", randomUUID())
      .send({
        type: "CLUB",
        code: `C-${tag}`,
        name: `Club ${tag}`,
        slug: `c-${tag}`,
        parentId: districtId,
      })
      .expect(201);
    clubId = club.body.id;
    await request(http)
      .post(`/api/kernel/v1/organizations/${clubId}/activate`)
      .set("authorization", `Bearer ${superAdminToken}`)
      .set("idempotency-key", randomUUID())
      .expect(201);
    // superAdminToken stays SUPERADMIN for the suite's lifetime — it's
    // only ever used for privileged setup (creating orgs/memberships).
    // The actual regression assertions run as other actors
    // (president/memberA/memberB tokens), whose role-scoped privilege is
    // exactly what's under test, so the bypass never taints those checks.
  });

  afterAll(async () => {
    await prisma.membershipApplication.deleteMany({
      where: { organizationId: clubId },
    });
    // RoleAssignment references organizationId (Restrict) — must go
    // before the organizations themselves.
    await prisma.roleAssignment.deleteMany({
      where: { organizationId: { in: [clubId, districtId] } },
    });
    await prisma.organizationMembership.deleteMany({
      where: { organizationId: clubId },
    });
    await prisma.kernelAuditLog.deleteMany({
      where: { organizationId: { in: [clubId, districtId] } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [clubId, districtId] } },
    });
    const accounts = await prisma.userAccount.findMany({
      where: { email: { contains: tag } },
      select: { id: true, personId: true },
    });
    const accountIds = accounts.map((a) => a.id);
    const personIds = accounts.map((a) => a.personId);
    await prisma.kernelAuditLog.deleteMany({ where: { resourceId: { in: accountIds } } });
    await prisma.accountSession.deleteMany({ where: { accountId: { in: accountIds } } });
    await prisma.roleAssignment.deleteMany({ where: { personId: { in: personIds } } });
    await prisma.userAccount.deleteMany({ where: { id: { in: accountIds } } });
    await prisma.person.deleteMany({ where: { id: { in: personIds } } });
    await prisma.$disconnect();
    await app.close();
  });

  it("lets an ORGANIZATION-scoped role act on a route that only carries the entity's own id (WS1 regression)", async () => {
    const president = await registerAndActivate("president");
    await grantRoleForTests(
      prisma,
      president.personId,
      "CLUB_PRESIDENT",
      "ORGANIZATION",
      clubId,
    );

    const membership = await request(http)
      .post(`/api/kernel/v1/organizations/${clubId}/memberships`)
      .set("authorization", `Bearer ${superAdminToken}`)
      .set("idempotency-key", randomUUID())
      .send({ personId: president.personId, status: "ACTIVE" })
      .expect((res) => {
        if (![200, 201].includes(res.status))
          throw new Error(`unexpected status ${res.status}: ${JSON.stringify(res.body)}`);
      });

    // POST /memberships/:membershipId/leave carries no organizationId at
    // all — this is exactly the route class WS1 fixed.
    await request(http)
      .post(`/api/kernel/v1/memberships/${membership.body.id}/leave`)
      .set("authorization", `Bearer ${president.token}`)
      .set("idempotency-key", randomUUID())
      .expect(201)
      .expect((res) => {
        if (res.body.status !== "ON_LEAVE")
          throw new Error(`expected ON_LEAVE, got ${res.body.status}`);
      });
  });

  it("enforces application ownership: only the requester or a reviewer may read/list it", async () => {
    const memberA = await registerAndActivate("member-a");
    const memberB = await registerAndActivate("member-b");

    const application = await request(http)
      .post("/api/kernel/v1/membership-applications")
      .set("authorization", `Bearer ${memberA.token}`)
      .set("idempotency-key", randomUUID())
      .send({ organizationId: clubId, requesterPersonId: memberA.personId })
      .expect(201);

    // Owner can read it directly.
    await request(http)
      .get(`/api/kernel/v1/membership-applications/${application.body.id}`)
      .set("authorization", `Bearer ${memberA.token}`)
      .expect(200);

    // A third party without kernel.application.review cannot.
    await request(http)
      .get(`/api/kernel/v1/membership-applications/${application.body.id}`)
      .set("authorization", `Bearer ${memberB.token}`)
      .expect(403);

    // Listing with no filter returns only the actor's own applications.
    const ownList = await request(http)
      .get("/api/kernel/v1/membership-applications")
      .set("authorization", `Bearer ${memberA.token}`)
      .expect(200);
    expect(ownList.body.some((item: any) => item.id === application.body.id)).toBe(
      true,
    );

    // Trying to filter by someone else's personId is silently overridden,
    // not honored (this is the Express 5 req.query-getter regression).
    const spoofedList = await request(http)
      .get(
        `/api/kernel/v1/membership-applications?personId=${memberA.personId}`,
      )
      .set("authorization", `Bearer ${memberB.token}`)
      .expect(200);
    expect(spoofedList.body).toEqual([]);
  });
});
