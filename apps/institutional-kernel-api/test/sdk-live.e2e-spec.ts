import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

import { createTestApp, e2eTag, testPrisma } from "./support/test-app";

describe("Kernel SDK live contract", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const tag = e2eTag();
  let accountId: string;
  let personId: string;
  let organizationId: string;
  let membershipId: string;
  let periodId: string;

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0, "127.0.0.1");
    prisma = testPrisma();
    const person = await prisma.person.create({
      data: { firstName: "SDK", lastName: tag },
    });
    personId = person.id;
    const account = await prisma.userAccount.create({
      data: {
        personId,
        email: `${tag}@sdk.example.test`,
        emailNormalized: `${tag}@sdk.example.test`,
        passwordHash: "not-used-by-service-api",
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
      },
    });
    accountId = account.id;
    const organization = await prisma.organization.create({
      data: {
        type: "DISTRICT",
        code: `SDK-${tag}`,
        name: `SDK ${tag}`,
        slug: `sdk-${tag}`,
        status: "ACTIVE",
      },
    });
    organizationId = organization.id;
    const membership = await prisma.organizationMembership.create({
      data: {
        organizationId,
        personId,
        status: "ACTIVE",
        joinedAt: new Date(),
      },
    });
    membershipId = membership.id;
    const period = await prisma.institutionalPeriod.create({
      data: {
        organizationId,
        code: `2026-${tag}`,
        name: `SDK ${tag}`,
        sequence: 1,
        startDate: new Date("2026-07-01T00:00:00.000Z"),
        endDate: new Date("2027-06-30T00:00:00.000Z"),
        status: "ACTIVE",
      },
    });
    periodId = period.id;
  });

  afterAll(async () => {
    await prisma.institutionalPeriod.deleteMany({ where: { id: periodId } });
    await prisma.organizationMembership.deleteMany({
      where: { id: membershipId },
    });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.userAccount.deleteMany({ where: { id: accountId } });
    await prisma.person.deleteMany({ where: { id: personId } });
    await prisma.$disconnect();
    await app.close();
  });

  it("uses the packaged ESM SDK against the running Service API", async () => {
    const server = app.getHttpServer().address() as { port: number };
    const jwt = app.get(JwtService);
    const token = await jwt.signAsync(
      {
        sub: "sdk-live-test",
        scope: [
          "kernel.service.users.read",
          "kernel.service.persons.read",
          "kernel.service.organizations.read",
          "kernel.service.memberships.read",
          "kernel.service.authorities.read",
          "kernel.service.periods.read",
          "kernel.service.authorization.check",
        ],
      },
      { audience: "institutional-kernel", expiresIn: "5m" },
    );
    // Jest runs CommonJS tests, while the published SDK is ESM. Function()
    // preserves the native import so this verifies its actual dist artifact.
    const importEsm = new Function("specifier", "return import(specifier)") as (
      specifier: string,
    ) => Promise<{
      KernelClient: new (options: {
        baseUrl: string;
        serviceToken: string;
      }) => any;
    }>;
    const { KernelClient } = await importEsm(
      pathToFileURL(
        resolve(__dirname, "../../../packages/kernel-sdk/dist/index.js"),
      ).href,
    );
    const client = new KernelClient({
      baseUrl: `http://127.0.0.1:${server.port}/api/kernel/v1`,
      serviceToken: token,
    });

    await expect(client.getUserContext(accountId)).resolves.toMatchObject({
      accountId,
      personId,
    });
    await expect(client.getPerson(personId)).resolves.toMatchObject({
      id: personId,
    });
    await expect(client.getOrganization(organizationId)).resolves.toMatchObject(
      { id: organizationId },
    );
    await expect(
      client.getMembershipSnapshot(organizationId),
    ).resolves.toMatchObject({
      organizationId,
      members: expect.arrayContaining([
        expect.objectContaining({ membershipId, personId }),
      ]),
    });
    await expect(
      client.getAuthoritySnapshot(organizationId),
    ).resolves.toMatchObject({ organizationId, periodId });
    await expect(
      client.getPeriodSnapshot(organizationId),
    ).resolves.toMatchObject({
      organizationId,
      currentPeriod: expect.objectContaining({ periodId }),
    });
    await expect(
      client.checkAuthorization({
        subjectId: personId,
        permission: "kernel.organization.read",
        scope: { type: "ORGANIZATION", organizationId },
      }),
    ).resolves.toMatchObject({
      subjectId: personId,
      permission: "kernel.organization.read",
    });
  });
});
