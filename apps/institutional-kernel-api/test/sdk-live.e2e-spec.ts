import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

import {
  hashClientSecret,
  newClientId,
  newClientSecret,
} from "../src/application/developer-apps/credentials";
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
  let developerAppId: string;
  let clientId: string;
  let clientSecret: string;

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
    // A developer app registered for the district (what the console's
    // POST /developer/apps stores), so the SDK runs with a real
    // client_credentials token instead of a JWT_SECRET-signed one.
    clientId = newClientId();
    const secret = newClientSecret();
    clientSecret = secret.secret;
    const developerApp = await prisma.developerApp.create({
      data: {
        clientId,
        name: `SDK ${tag}`,
        type: "CONFIDENTIAL",
        organizationId,
        ownerPersonId: personId,
        grantTypes: ["client_credentials"],
        scopes: [
          "kernel.service.users.read",
          "kernel.service.persons.read",
          "kernel.service.organizations.read",
          "kernel.service.memberships.read",
          "kernel.service.authorities.read",
          "kernel.service.periods.read",
          "kernel.service.authorization.check",
        ],
        redirectUris: [],
        secrets: {
          create: {
            secretHash: await hashClientSecret(secret.secret),
            hint: secret.hint,
          },
        },
      },
    });
    developerAppId = developerApp.id;
  });

  afterAll(async () => {
    await prisma.developerApp.deleteMany({ where: { id: developerAppId } });
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
    const baseUrl = `http://127.0.0.1:${server.port}/api/kernel/v1`;
    // client_credentials, exactly as a committee's server would do it.
    const tokenResponse = await fetch(`${baseUrl}/oauth/token`, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ grant_type: "client_credentials" }),
    });
    expect(tokenResponse.status).toBe(200);
    const { access_token: token } = (await tokenResponse.json()) as {
      access_token: string;
    };
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
      baseUrl,
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
