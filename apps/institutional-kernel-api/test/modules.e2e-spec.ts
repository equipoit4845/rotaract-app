import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";
import request from "supertest";

import { createTestApp, e2eTag, testPrisma } from "./support/test-app";

/**
 * kernel-spec.md §21 DoD: "un módulo ficticio puede registrarse e
 * instalarse sin modificar el kernel". This exercises that exact claim
 * end-to-end against the real HTTP API, plus the 6.10.3/6.10.4 invariants
 * fixed in this pass.
 */
describe("Modules E2E", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let http: any;
  const tag = e2eTag();
  const moduleId = `e2e-fixture-${tag}`;
  let superAdminToken: string;
  let superAdminAccountId: string;
  let orgId: string;

  beforeAll(async () => {
    app = await createTestApp();
    http = app.getHttpServer();
    prisma = testPrisma();

    const email = `${tag}-modules-admin@example.test`;
    const password = "a-very-long-e2e-password-1";
    const registered = await request(http)
      .post("/api/kernel/v1/auth/register")
      .send({ email, password, firstName: "E2E", lastName: "ModulesAdmin" })
      .expect(201);
    superAdminAccountId = registered.body.id;
    await prisma.userAccount.update({
      where: { id: superAdminAccountId },
      data: {
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
        platformRole: "SUPERADMIN",
      },
    });
    const login = await request(http)
      .post("/api/kernel/v1/auth/login")
      .send({ email, password })
      .expect(200);
    superAdminToken = login.body.accessToken;

    const org = await request(http)
      .post("/api/kernel/v1/organizations")
      .set("authorization", `Bearer ${superAdminToken}`)
      .set("idempotency-key", randomUUID())
      .send({
        type: "DISTRICT",
        code: `D-MOD-${tag}`,
        name: `Modules District ${tag}`,
        slug: `d-mod-${tag}`,
      })
      .expect(201);
    orgId = org.body.id;
  });

  afterAll(async () => {
    await prisma.moduleInstallation.deleteMany({ where: { moduleId } });
    await prisma.moduleDefinition.deleteMany({ where: { id: moduleId } });
    await prisma.kernelAuditLog.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await prisma.accountSession.deleteMany({ where: { accountId: superAdminAccountId } });
    await prisma.userAccount.deleteMany({ where: { id: superAdminAccountId } });
    await prisma.$disconnect();
    await app.close();
  });

  it("registers, installs and activates a fictitious module without touching kernel code", async () => {
    await request(http)
      .post("/api/kernel/v1/modules")
      .set("authorization", `Bearer ${superAdminToken}`)
      .set("idempotency-key", randomUUID())
      .send({
        id: moduleId,
        name: "E2E Fixture Module",
        version: "1.0.0",
        manifest: { permissions: [], events: { publishes: [], subscribes: [] }, capabilities: [] },
      })
      .expect(201);

    await request(http)
      .post(`/api/kernel/v1/organizations/${orgId}/modules/${moduleId}/install`)
      .set("authorization", `Bearer ${superAdminToken}`)
      .set("idempotency-key", randomUUID())
      .expect(201);

    const activated = await request(http)
      .post(`/api/kernel/v1/organizations/${orgId}/modules/${moduleId}/activate`)
      .set("authorization", `Bearer ${superAdminToken}`)
      .set("idempotency-key", randomUUID())
      .expect(201);
    expect(activated.body.status).toBe("ACTIVE");

    const outboxTypes = await prisma.outboxMessage.findMany({
      where: { aggregateId: `${moduleId}:${orgId}` },
      select: { eventType: true },
    });
    expect(outboxTypes.map((m) => m.eventType)).toEqual(
      expect.arrayContaining([
        "kernel.module-installed.v1",
        "kernel.module-activated.v1",
      ]),
    );
  });

  it("refuses to install a deprecated module (invariant 6.10.3)", async () => {
    const deprecatedId = `${moduleId}-deprecated`;
    await request(http)
      .post("/api/kernel/v1/modules")
      .set("authorization", `Bearer ${superAdminToken}`)
      .set("idempotency-key", randomUUID())
      .send({
        id: deprecatedId,
        name: "Deprecated Fixture Module",
        version: "1.0.0",
        manifest: { permissions: [], events: { publishes: [], subscribes: [] }, capabilities: [] },
      })
      .expect(201);
    await request(http)
      .post(`/api/kernel/v1/modules/${deprecatedId}/deprecate`)
      .set("authorization", `Bearer ${superAdminToken}`)
      .set("idempotency-key", randomUUID())
      .expect(201);

    await request(http)
      .post(`/api/kernel/v1/organizations/${orgId}/modules/${deprecatedId}/install`)
      .set("authorization", `Bearer ${superAdminToken}`)
      .set("idempotency-key", randomUUID())
      .expect(409);

    await prisma.moduleDefinition.deleteMany({ where: { id: deprecatedId } });
  });
});
