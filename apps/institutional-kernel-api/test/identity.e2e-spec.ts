import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import request from "supertest";

import { createTestApp, e2eTag, testPrisma, activateForTests } from "./support/test-app";

describe("Identity E2E (register → verify → login → refresh → lockout)", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let http: any;
  const tag = e2eTag();
  const email = `${tag}@example.test`;
  const password = "a-very-long-e2e-password-1";
  let accountId: string;
  let personId: string;

  beforeAll(async () => {
    app = await createTestApp();
    http = app.getHttpServer();
    prisma = testPrisma();
  });

  afterAll(async () => {
    if (accountId) {
      await prisma.kernelAuditLog.deleteMany({ where: { resourceId: accountId } });
      await prisma.accountSession.deleteMany({ where: { accountId } });
      await prisma.emailVerificationToken.deleteMany({ where: { accountId } });
      await prisma.userAccount.deleteMany({ where: { id: accountId } });
    }
    if (personId) {
      await prisma.roleAssignment.deleteMany({ where: { personId } });
      await prisma.person.deleteMany({ where: { id: personId } });
    }
    await prisma.$disconnect();
    await app.close();
  });

  it("registers a new account as PENDING_VERIFICATION", async () => {
    const response = await request(http)
      .post("/api/kernel/v1/auth/register")
      .send({ email, password, firstName: "E2E", lastName: "Identity" })
      .expect(201);

    expect(response.body.status).toBe("PENDING_VERIFICATION");
    accountId = response.body.id;
    personId = response.body.personId;
  });

  it("rejects login before the account is verified", async () => {
    await request(http)
      .post("/api/kernel/v1/auth/login")
      .send({ email, password })
      .expect(401);
  });

  it("logs in and reaches /auth/me once activated", async () => {
    await activateForTests(prisma, accountId, personId);

    const login = await request(http)
      .post("/api/kernel/v1/auth/login")
      .send({ email, password })
      .expect(200);
    expect(login.body.accessToken).toEqual(expect.any(String));

    const me = await request(http)
      .get("/api/kernel/v1/auth/me")
      .set("authorization", `Bearer ${login.body.accessToken}`)
      .expect(200);
    expect(me.body.account.id).toBe(accountId);
  });

  it("rotates the refresh token on /auth/refresh", async () => {
    const login = await request(http)
      .post("/api/kernel/v1/auth/login")
      .send({ email, password })
      .expect(200);

    const refreshed = await request(http)
      .post("/api/kernel/v1/auth/refresh")
      .send({ refreshToken: login.body.refreshToken })
      .expect(200);
    expect(refreshed.body.accessToken).not.toBe(login.body.accessToken);

    // The old refresh token was revoked by rotation.
    await request(http)
      .post("/api/kernel/v1/auth/refresh")
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);
  });

  it("locks the account out after repeated failed logins (§14.1) and audits every attempt (§14.4)", async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      await request(http)
        .post("/api/kernel/v1/auth/login")
        .send({ email, password: "wrong-password" })
        .expect(401);
    }

    // Correct password still rejected: the account is locked.
    await request(http)
      .post("/api/kernel/v1/auth/login")
      .send({ email, password })
      .expect(401);

    const account = await prisma.userAccount.findUniqueOrThrow({
      where: { id: accountId },
    });
    expect(account.lockedUntil).not.toBeNull();
    expect(account.lockedUntil!.getTime()).toBeGreaterThan(Date.now());

    const failures = await prisma.kernelAuditLog.count({
      where: { resourceId: accountId, action: "AuthenticateAccount", result: "FAILURE" },
    });
    expect(failures).toBeGreaterThanOrEqual(6);
  });
});
