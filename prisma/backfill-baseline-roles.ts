/**
 * One-off, idempotent data repair for installations whose accounts and
 * memberships were imported (legacy seed) instead of going through the
 * Kernel's own flows, and therefore never received their baseline roles.
 *
 *   - PLATFORM_USER (PLATFORM scope) for every ACTIVE account.
 *   - MEMBER (ORGANIZATION scope) for every ACTIVE / ON_LEAVE membership.
 *   - Human names for system positions/roles/permissions still named by code.
 *   - With exactly one district, its unowned system positions become owned
 *     by it, so the district (RDR) manages its catalog instead of only
 *     SUPERADMIN.
 *
 * Dry run by default; pass --apply to write.
 *   tsx prisma/backfill-baseline-roles.ts [--apply]
 */
import { PrismaClient, ScopeType } from "@prisma/client";

import { permissionNames, positionNames, roleNames } from "./catalog-labels";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

async function main(): Promise<void> {
  const [platformUser, member] = await Promise.all([
    prisma.roleDefinition.findUniqueOrThrow({
      where: { code: "PLATFORM_USER" },
    }),
    prisma.roleDefinition.findUniqueOrThrow({ where: { code: "MEMBER" } }),
  ]);
  const now = new Date();

  const accounts = await prisma.userAccount.findMany({
    where: {
      status: "ACTIVE",
      person: {
        roleAssignments: {
          none: { roleDefinitionId: platformUser.id, revokedAt: null },
        },
      },
    },
    select: { personId: true },
  });

  const memberships = await prisma.organizationMembership.findMany({
    where: { status: { in: ["ACTIVE", "ON_LEAVE"] } },
    select: { id: true, personId: true, organizationId: true },
  });
  const heldMember = await prisma.roleAssignment.findMany({
    where: {
      roleDefinitionId: member.id,
      revokedAt: null,
      scopeType: ScopeType.ORGANIZATION,
    },
    select: { personId: true, organizationId: true },
  });
  const held = new Set(
    heldMember.map((a) => `${a.personId}:${a.organizationId}`),
  );
  const missingMember = memberships.filter(
    (m) => !held.has(`${m.personId}:${m.organizationId}`),
  );

  const districts = await prisma.organization.findMany({
    where: { type: "DISTRICT" },
    select: { id: true, name: true },
  });
  const unownedSystemPositions = await prisma.positionDefinition.findMany({
    where: { isSystem: true, ownerOrganizationId: null },
    select: { id: true, code: true },
  });

  console.log(`PLATFORM_USER to grant: ${accounts.length}`);
  console.log(`MEMBER to grant:        ${missingMember.length}`);
  console.log(
    `System positions to hand to the district: ${
      districts.length === 1 ? unownedSystemPositions.length : 0
    }${districts.length === 1 ? ` (${districts[0].name})` : " (needs exactly one district)"}`,
  );
  if (!apply) {
    console.log("Dry run. Re-run with --apply to write.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const { personId } of accounts)
      await tx.roleAssignment.create({
        data: {
          personId,
          roleDefinitionId: platformUser.id,
          scopeType: ScopeType.PLATFORM,
          validFrom: now,
          reason: "backfill:baseline-role",
        },
      });
    for (const m of missingMember)
      await tx.roleAssignment.create({
        data: {
          personId: m.personId,
          roleDefinitionId: member.id,
          scopeType: ScopeType.ORGANIZATION,
          organizationId: m.organizationId,
          validFrom: now,
          reason: `membership:${m.id}`,
        },
      });
    for (const [code, name] of Object.entries(positionNames))
      await tx.positionDefinition.updateMany({
        where: { code, name: code },
        data: { name },
      });
    for (const [code, name] of Object.entries(roleNames))
      await tx.roleDefinition.updateMany({
        where: { code, name: code },
        data: { name },
      });
    for (const [code, name] of Object.entries(permissionNames))
      await tx.permissionDefinition.updateMany({
        where: { code, name: code },
        data: { name },
      });
    if (districts.length === 1)
      await tx.positionDefinition.updateMany({
        where: { isSystem: true, ownerOrganizationId: null },
        data: { ownerOrganizationId: districts[0].id },
      });
  });
  console.log("Applied.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
