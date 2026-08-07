import { RequestMethod, ValidationPipe } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";

import { AppModule } from "../../src/app.module";
import { ProblemFilter } from "../../src/interfaces/http/problem.filter";

/**
 * Boots the real Nest application (full DI graph, real Postgres/Redis/NATS
 * — see README below) so E2E specs exercise the actual HTTP pipeline
 * (guards, pipes, filters), not mocks. Requires:
 *   docker compose up -d postgres redis nats
 * with KERNEL_DATABASE_URL/REDIS_URL/NATS_URL pointed at localhost (the
 * in-container hostnames like "postgres" only resolve inside the compose
 * network).
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalFilters(new ProblemFilter());
  app.setGlobalPrefix("api/kernel/v1", {
    exclude: [{ path: "health/*path", method: RequestMethod.ALL }],
  });
  await app.init();
  return app;
}

export function testPrisma(): PrismaClient {
  return new PrismaClient();
}

/** Unique-enough identifiers so parallel/repeated E2E runs never collide with real data. */
export function e2eTag(): string {
  return `e2e-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
}

/**
 * Test-only shortcut for "the account finished email verification": sets
 * ACTIVE + grants the PLATFORM_USER baseline role, exactly what
 * AuthService.verifyEmail() does — but without needing the raw
 * (argon2-hashed, never-logged) verification token a real email would
 * carry.
 */
export async function activateForTests(
  prisma: PrismaClient,
  accountId: string,
  personId: string,
): Promise<void> {
  await prisma.userAccount.update({
    where: { id: accountId },
    data: { status: "ACTIVE", emailVerifiedAt: new Date() },
  });
  const role = await prisma.roleDefinition.findUnique({
    where: { code: "PLATFORM_USER" },
  });
  if (!role) return;
  const existing = await prisma.roleAssignment.findFirst({
    where: { personId, roleDefinitionId: role.id, revokedAt: null },
  });
  if (existing) return;
  await prisma.roleAssignment.create({
    data: {
      personId,
      roleDefinitionId: role.id,
      scopeType: "PLATFORM",
      effect: "ALLOW",
      validFrom: new Date(),
    },
  });
}

export async function grantRoleForTests(
  prisma: PrismaClient,
  personId: string,
  roleCode: string,
  scopeType: "PLATFORM" | "ORGANIZATION" | "ORGANIZATION_TREE",
  organizationId?: string,
): Promise<void> {
  const role = await prisma.roleDefinition.findUniqueOrThrow({
    where: { code: roleCode },
  });
  await prisma.roleAssignment.create({
    data: {
      personId,
      roleDefinitionId: role.id,
      scopeType,
      organizationId,
      effect: "ALLOW",
      validFrom: new Date(),
    },
  });
}
