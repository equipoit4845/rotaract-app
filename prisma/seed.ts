import * as argon2 from "argon2";
import {
  AccountStatus,
  OrganizationType,
  PlatformRole,
  PrismaClient,
} from "@prisma/client";

const prisma = new PrismaClient();

// kernel-spec.md §10.1 — the kernel's own permission catalog.
const permissionCodes = [
  "kernel.account.read.self",
  "kernel.account.update.self",
  "kernel.account.manage",
  "kernel.person.read.self",
  "kernel.person.update.self",
  "kernel.person.read",
  "kernel.person.manage",
  "kernel.organization.read",
  "kernel.organization.create",
  "kernel.organization.update",
  "kernel.organization.activate",
  "kernel.organization.archive",
  "kernel.organization.move",
  "kernel.membership.read",
  "kernel.membership.create",
  "kernel.membership.update",
  "kernel.membership.activate",
  "kernel.membership.deactivate",
  "kernel.membership.transfer",
  "kernel.period.read",
  "kernel.period.create",
  "kernel.period.update",
  "kernel.period.activate",
  "kernel.period.close",
  "kernel.appointment.read",
  "kernel.appointment.create",
  "kernel.appointment.activate",
  "kernel.appointment.end",
  "kernel.appointment.revoke",
  "kernel.position.read",
  "kernel.position.create",
  "kernel.position.manage",
  "kernel.application.create.self",
  "kernel.application.read.self",
  "kernel.application.cancel.self",
  "kernel.application.review",
  "kernel.transfer.create.self",
  "kernel.transfer.read.self",
  "kernel.transfer.accept",
  "kernel.transfer.confirm",
  "kernel.transfer.reject",
  "kernel.role.read",
  "kernel.role.manage",
  "kernel.role.assign",
  "kernel.role.revoke",
  "kernel.module.read",
  "kernel.module.register",
  "kernel.module.install",
  "kernel.module.configure",
  "kernel.module.disable",
  "kernel.audit.read",
];
const roles = [
  "PLATFORM_USER",
  "DISTRICT_RDR",
  "DISTRICT_SECRETARY",
  "CLUB_PRESIDENT",
  "CLUB_SECRETARY",
  "CLUB_TREASURER",
  "MEMBER",
];
const positions: Array<[string, OrganizationType, boolean]> = [
  ["DISTRICT_RDR", "DISTRICT", true],
  ["DISTRICT_SECRETARY", "DISTRICT", false],
  ["DISTRICT_TREASURER", "DISTRICT", false],
  ["CLUB_PRESIDENT", "CLUB", true],
  ["CLUB_PRESIDENT_ELECT", "CLUB", true],
  ["CLUB_VICE_PRESIDENT", "CLUB", false],
  ["CLUB_SECRETARY", "CLUB", false],
  ["CLUB_TREASURER", "CLUB", false],
  ["CLUB_PAST_PRESIDENT", "CLUB", false],
];

// kernel-spec.md §10.2 — "permisos principales" per initial role, expanded
// to concrete codes from the §10.1 catalog. PLATFORM_USER is the baseline
// self-service role every account gets; the others layer on organizational
// or district-tree management.
const selfServicePermissions = [
  "kernel.account.read.self",
  "kernel.account.update.self",
  "kernel.person.read.self",
  "kernel.person.update.self",
  "kernel.application.create.self",
  "kernel.application.read.self",
  "kernel.application.cancel.self",
  "kernel.transfer.create.self",
  "kernel.transfer.read.self",
];
const rolePermissions: Record<string, string[]> = {
  PLATFORM_USER: selfServicePermissions,
  DISTRICT_RDR: [
    ...selfServicePermissions,
    "kernel.person.read",
    "kernel.person.manage",
    "kernel.organization.read",
    "kernel.organization.update",
    "kernel.organization.move",
    "kernel.organization.activate",
    "kernel.organization.archive",
    "kernel.membership.read",
    "kernel.period.read",
    "kernel.period.create",
    "kernel.period.update",
    "kernel.period.activate",
    "kernel.period.close",
    "kernel.appointment.read",
    "kernel.appointment.create",
    "kernel.appointment.activate",
    "kernel.appointment.end",
    "kernel.appointment.revoke",
    "kernel.position.read",
    "kernel.position.create",
    "kernel.position.manage",
    "kernel.application.review",
    "kernel.transfer.accept",
    "kernel.transfer.confirm",
    "kernel.transfer.reject",
    "kernel.role.read",
    "kernel.role.assign",
    "kernel.role.revoke",
    "kernel.module.read",
    "kernel.module.install",
    "kernel.module.configure",
    "kernel.module.disable",
    "kernel.audit.read",
  ],
  DISTRICT_SECRETARY: [
    ...selfServicePermissions,
    "kernel.person.read",
    "kernel.person.manage",
    "kernel.organization.read",
    "kernel.organization.update",
    "kernel.membership.read",
    "kernel.membership.create",
    "kernel.membership.update",
    "kernel.membership.activate",
    "kernel.membership.deactivate",
    "kernel.membership.transfer",
    "kernel.period.read",
    "kernel.period.create",
    "kernel.period.update",
    "kernel.period.activate",
    "kernel.period.close",
    "kernel.appointment.read",
    "kernel.appointment.create",
    "kernel.appointment.activate",
    "kernel.appointment.end",
    "kernel.appointment.revoke",
    "kernel.application.review",
    "kernel.transfer.accept",
    "kernel.transfer.confirm",
    "kernel.transfer.reject",
    "kernel.module.read",
  ],
  CLUB_PRESIDENT: [
    ...selfServicePermissions,
    "kernel.person.read",
    "kernel.organization.read",
    "kernel.organization.update",
    "kernel.membership.read",
    "kernel.membership.create",
    "kernel.membership.update",
    "kernel.membership.activate",
    "kernel.membership.deactivate",
    "kernel.period.read",
    "kernel.appointment.read",
    "kernel.appointment.create",
    "kernel.appointment.activate",
    "kernel.appointment.end",
    "kernel.appointment.revoke",
    "kernel.application.review",
    "kernel.transfer.accept",
    "kernel.transfer.confirm",
    "kernel.transfer.reject",
    "kernel.module.read",
    "kernel.module.install",
    "kernel.module.configure",
    "kernel.module.disable",
  ],
  CLUB_SECRETARY: [
    ...selfServicePermissions,
    "kernel.person.read",
    "kernel.organization.read",
    "kernel.membership.read",
    "kernel.membership.create",
    "kernel.membership.update",
    "kernel.membership.activate",
    "kernel.membership.deactivate",
    "kernel.application.review",
    "kernel.transfer.accept",
    "kernel.transfer.confirm",
    "kernel.transfer.reject",
    "kernel.module.read",
  ],
  CLUB_TREASURER: [
    ...selfServicePermissions,
    "kernel.organization.read",
    "kernel.membership.read",
    "kernel.period.read",
    "kernel.module.read",
  ],
  MEMBER: [
    ...selfServicePermissions,
    "kernel.organization.read",
    "kernel.membership.read",
    "kernel.period.read",
    "kernel.appointment.read",
    "kernel.module.read",
  ],
};

async function main(): Promise<void> {
  for (const code of permissionCodes)
    await prisma.permissionDefinition.upsert({
      where: { code },
      update: {},
      create: { code, namespace: "kernel", name: code, isSystem: true },
    });
  // Retire system-seeded permission codes that a previous version of this
  // seed created but the current §10.1 catalog no longer defines (e.g. the
  // old coarse kernel.*.manage codes). RolePermission rows referencing them
  // cascade-delete; module-registered permissions (isSystem: false) are
  // never touched here. Swallow the (unlikely) case where a
  // PositionDefinition.editPermissionCode still points at a retired code —
  // cleanup is best-effort, not a reason to fail the whole seed.
  try {
    await prisma.permissionDefinition.deleteMany({
      where: { isSystem: true, code: { notIn: permissionCodes } },
    });
  } catch (error) {
    console.warn("Skipped removing some retired permission codes:", error);
  }
  for (const code of roles)
    await prisma.roleDefinition.upsert({
      where: { code },
      update: {},
      create: { code, name: code, isSystem: true },
    });
  for (const [code, organizationType, isSingletonPerPeriod] of positions)
    await prisma.positionDefinition.upsert({
      where: { code },
      update: {},
      create: {
        code,
        name: code,
        organizationType,
        editPermissionCode: "kernel.position.manage",
        defaultRoleCode: roles.includes(code) ? code : null,
        isSingletonPerPeriod,
        isSystem: true,
      },
    });
  for (const [roleCode, codes] of Object.entries(rolePermissions)) {
    const role = await prisma.roleDefinition.findUniqueOrThrow({
      where: { code: roleCode },
    });
    for (const permissionCode of codes) {
      const permission = await prisma.permissionDefinition.findUniqueOrThrow({
        where: { code: permissionCode },
      });
      await prisma.rolePermission.upsert({
        where: {
          roleDefinitionId_permissionDefinitionId: {
            roleDefinitionId: role.id,
            permissionDefinitionId: permission.id,
          },
        },
        update: {},
        create: {
          roleDefinitionId: role.id,
          permissionDefinitionId: permission.id,
        },
      });
    }
  }
  await prisma.moduleDefinition.upsert({
    where: { id: "meetings" },
    update: {},
    create: {
      id: "meetings",
      name: "Reuniones",
      version: "1.0.0",
      status: "ACTIVE",
      manifest: {
        permissions: [],
        events: { publishes: [], subscribes: [] },
        capabilities: [],
      },
    },
  });
  const email = process.env.KERNEL_SUPERADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.KERNEL_SUPERADMIN_PASSWORD;
  if (email && password) {
    const person =
      (await prisma.person.findFirst({ where: { primaryEmail: email } })) ??
      (await prisma.person.create({
        data: {
          firstName: process.env.KERNEL_SUPERADMIN_FIRST_NAME ?? "Kernel",
          lastName: process.env.KERNEL_SUPERADMIN_LAST_NAME ?? "Administrator",
          primaryEmail: email,
        },
      }));
    await prisma.userAccount.upsert({
      where: { emailNormalized: email },
      update: {
        platformRole: PlatformRole.SUPERADMIN,
        status: AccountStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      },
      create: {
        personId: person.id,
        email,
        emailNormalized: email,
        passwordHash: await argon2.hash(password),
        platformRole: PlatformRole.SUPERADMIN,
        status: AccountStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      },
    });
  }
}
main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    await prisma.$disconnect();
    throw error;
  });
