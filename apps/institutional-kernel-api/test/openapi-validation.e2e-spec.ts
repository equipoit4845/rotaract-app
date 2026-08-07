import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import request from "supertest";

import { createTestApp, e2eTag, testPrisma } from "./support/test-app";

describe("OpenAPI runtime validation", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const tag = e2eTag();
  const email = `${tag}@openapi.example.test`;
  let accountId: string | undefined;
  let personId: string | undefined;

  beforeAll(async () => {
    // This suite validates both sides of the HTTP boundary. The normal E2E
    // suite keeps response validation off so application errors remain local
    // and easy to diagnose, while requests are always contract-validated.
    process.env.KERNEL_OPENAPI_RESPONSE_VALIDATION = "true";
    app = await createTestApp();
    prisma = testPrisma();
  });

  afterAll(async () => {
    // Resolve by email as well as response ids: response validation deliberately
    // runs after the command commits, so a failed contract assertion must not
    // leave a synthetic account behind.
    const persisted = await prisma.userAccount.findUnique({
      where: { emailNormalized: email },
      select: { id: true, personId: true },
    });
    accountId ??= persisted?.id;
    personId ??= persisted?.personId;
    if (accountId) {
      await prisma.accountSession.deleteMany({ where: { accountId } });
      await prisma.emailVerificationToken.deleteMany({ where: { accountId } });
      await prisma.userAccount.deleteMany({ where: { id: accountId } });
    }
    if (personId) await prisma.person.deleteMany({ where: { id: personId } });
    await prisma.$disconnect();
    await app.close();
    delete process.env.KERNEL_OPENAPI_RESPONSE_VALIDATION;
  });

  it("rejects a malformed DTO before its controller runs", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/kernel/v1/auth/register")
      .send({
        email: "not-an-email",
        firstName: "Missing",
        lastName: "Password",
      })
      .expect(400);
    expect(response.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(response.body.detail).toContain("OpenAPI validation failed");
  });

  it("accepts a documented DTO and validates its documented response", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/kernel/v1/auth/register")
      .send({
        email,
        password: "a-very-long-openapi-password",
        firstName: "OpenAPI",
        lastName: "Contract",
      });
    expect(response.status).toBe(201);
    accountId = response.body.id;
    personId = response.body.personId;
    expect(response.body).toMatchObject({
      id: accountId,
      personId,
      status: "PENDING_VERIFICATION",
    });
  });
});
