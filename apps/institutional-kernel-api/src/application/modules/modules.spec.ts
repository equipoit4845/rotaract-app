import {
  ConflictException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { readFileSync } from "fs";
import { resolve } from "path";

import { AuditService } from "../audit/audit.service";
import { AuthorizationService } from "../authorization/authorization.service";
import { KernelService } from "../kernel/kernel.service";
import { NotificationService } from "../notifications/notification.service";
import { OutboxService } from "../outbox/outbox.service";
import { CommandExecutorService } from "../shared/command-executor.service";
import { OptionalRedisCacheService } from "../../infrastructure/cache/optional-redis-cache.service";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

const manifest = () =>
  JSON.parse(
    readFileSync(
      resolve(
        __dirname,
        "../../../../../packages/module-manifest/examples/reuniones/mirotaract.module.json",
      ),
      "utf8",
    ),
  );

function buildKernel(prismaOverrides: Record<string, any>) {
  const fakePrisma: any = {
    organization: { findMany: jest.fn().mockResolvedValue([]) },
    ...prismaOverrides,
  };
  fakePrisma.$transaction = jest.fn((handler: any) => handler(fakePrisma));
  const commands = new CommandExecutorService(fakePrisma as PrismaService);
  const outbox = { record: jest.fn() } as unknown as OutboxService;
  const audit = { record: jest.fn() } as unknown as AuditService;
  const authorization = {
    invalidate: jest.fn(),
  } as unknown as AuthorizationService;
  const cache = {
    get: jest.fn().mockResolvedValue(undefined),
    set: jest.fn(),
    del: jest.fn(),
  } as unknown as OptionalRedisCacheService;
  const kernel = new KernelService(
    fakePrisma as PrismaService,
    commands,
    outbox,
    audit,
    authorization,
    { sendEmail: jest.fn() } as unknown as NotificationService,
    cache,
  );
  return { kernel, prisma: fakePrisma, outbox, audit, authorization };
}

const activeApp = {
  id: "app-1",
  clientId: "mr_app_reuniones",
  name: "Reuniones",
  status: "ACTIVE",
  organizationId: "district-1",
};

function registrationPrisma(extra: Record<string, any> = {}) {
  const created: any[] = [];
  return {
    created,
    prisma: {
      developerApp: { findUnique: jest.fn().mockResolvedValue(activeApp) },
      moduleDefinition: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }: any) => ({ ...data })),
      },
      permissionDefinition: {
        findMany: jest.fn(async ({ where }: any) =>
          where.moduleId ? created : [],
        ),
        create: jest.fn(async ({ data }: any) => {
          created.push({ id: `perm-${created.length}`, ...data });
          return created.at(-1);
        }),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      rolePermission: { findMany: jest.fn().mockResolvedValue([]) },
      roleAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      ...extra,
    } as any,
  };
}

describe("KernelService — modules from a manifest (E8)", () => {
  it("registers a module from its manifest, owned by the app's organization", async () => {
    const { prisma, created } = registrationPrisma();
    const { kernel, outbox } = buildKernel(prisma);

    const module = await kernel.registerModule({
      appId: "app-1",
      manifest: manifest(),
      // Ignored: everything comes from the manifest and the app.
      status: "DRAFT",
      ownerOrganizationId: "elsewhere",
    });

    expect(prisma.moduleDefinition.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: "reuniones",
        name: "Reuniones distritales",
        version: "1.0.0",
        status: "ACTIVE",
        developerAppId: "app-1",
        ownerOrganizationId: "district-1",
      }),
    });
    // Every manifest permission becomes a PermissionDefinition in the
    // module's namespace.
    expect(created.map((permission) => permission.code)).toEqual(
      manifest().permissions.map((permission: any) => permission.code),
    );
    expect(created.every((p) => p.namespace === "reuniones")).toBe(true);
    expect(created.every((p) => p.moduleId === "reuniones")).toBe(true);
    expect(created.every((p) => p.isSystem === false)).toBe(true);
    expect(module.permissions).toHaveLength(6);
    const events = (outbox.record as jest.Mock).mock.calls.map((c) => c[1]);
    expect(events).toEqual(
      expect.arrayContaining([
        "kernel.permissions.changed.v1",
        "kernel.module.registered.v1",
      ]),
    );
  });

  it("refuses a manifest whose permissions leave the module namespace (422, in Spanish)", async () => {
    const { prisma } = registrationPrisma();
    const { kernel } = buildKernel(prisma);
    const bad = manifest();
    bad.permissions[0].code = "kernel.role.assign";

    const error = await kernel
      .registerModule({ appId: "app-1", manifest: bad })
      .catch((e) => e);
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    const body = error.getResponse();
    expect(body.code).toBe("KERNEL_MODULE_MANIFEST_INVALID");
    expect(body.errors[0]).toMatchObject({ path: "permissions[0].code" });
    expect(body.message).toContain("tiene que empezar con «reuniones.»");
    expect(prisma.moduleDefinition.create).not.toHaveBeenCalled();
  });

  it("refuses a manifest that names another app's clientId", async () => {
    const { prisma } = registrationPrisma();
    const { kernel } = buildKernel(prisma);
    const other = manifest();
    other.oauth.clientId = "mr_app_someone_else";
    await expect(
      kernel.registerModule({ appId: "app-1", manifest: other }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it("refuses an inactive app and an existing module id", async () => {
    const suspended = registrationPrisma({
      developerApp: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ ...activeApp, status: "SUSPENDED" }),
      },
    });
    await expect(
      buildKernel(suspended.prisma).kernel.registerModule({
        appId: "app-1",
        manifest: manifest(),
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    const existing = registrationPrisma();
    existing.prisma.moduleDefinition.findUnique.mockResolvedValue({
      id: "reuniones",
    });
    await expect(
      buildKernel(existing.prisma).kernel.registerModule({
        appId: "app-1",
        manifest: manifest(),
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("refuses to take over a permission code that belongs to someone else", async () => {
    const { prisma } = registrationPrisma();
    prisma.permissionDefinition.findMany = jest.fn(async ({ where }: any) =>
      where.code
        ? [{ id: "p", code: "reuniones.vote.cast", moduleId: null }]
        : [],
    );
    const { kernel } = buildKernel(prisma);
    await expect(
      kernel.registerModule({ appId: "app-1", manifest: manifest() }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("updating the manifest adds, renames and removes permissions (and invalidates holders)", async () => {
    const current = [
      { id: "p1", code: "reuniones.meeting.manage", moduleId: "reuniones" },
      { id: "p2", code: "reuniones.old.thing", moduleId: "reuniones" },
    ];
    const { prisma } = registrationPrisma({
      moduleDefinition: {
        findUnique: jest.fn().mockResolvedValue({
          id: "reuniones",
          version: "1.0.0",
          developerAppId: "app-1",
        }),
        update: jest.fn(async ({ data }: any) => ({
          id: "reuniones",
          ...data,
        })),
      },
      rolePermission: {
        findMany: jest.fn().mockResolvedValue([{ roleDefinitionId: "role-1" }]),
      },
      roleAssignment: {
        findMany: jest.fn().mockResolvedValue([{ personId: "person-1" }]),
      },
    });
    prisma.permissionDefinition.findMany = jest.fn(async ({ where }: any) =>
      where.moduleId
        ? current
        : current.filter((p) => where.code.in.includes(p.code)),
    );
    const { kernel, authorization } = buildKernel(prisma);
    const next = { ...manifest(), version: "1.1.0" };

    await kernel.updateModuleManifest("reuniones", { manifest: next });

    expect(prisma.permissionDefinition.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "p1" } }),
    );
    expect(prisma.permissionDefinition.create).toHaveBeenCalledTimes(5);
    expect(prisma.permissionDefinition.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["p2"] } },
    });
    expect(authorization.invalidate).toHaveBeenCalledWith("person-1");
  });

  it("refuses a version downgrade and a manifest for another module", async () => {
    const { prisma } = registrationPrisma({
      moduleDefinition: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: "reuniones", version: "2.0.0" }),
        update: jest.fn(),
      },
    });
    const { kernel } = buildKernel(prisma);
    await expect(
      kernel.updateModuleManifest("reuniones", { manifest: manifest() }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(
      kernel.updateModuleManifest("otro", { manifest: manifest() }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.moduleDefinition.update).not.toHaveBeenCalled();
  });
});

describe("KernelService — installations (6.10 + E8)", () => {
  const schema = manifest().configurationSchema;
  const activeModule = {
    id: "reuniones",
    name: "Reuniones distritales",
    status: "ACTIVE",
    configurationSchema: schema,
  };

  function installPrisma(extra: Record<string, any> = {}) {
    return {
      moduleDefinition: {
        findUnique: jest.fn().mockResolvedValue(activeModule),
        findUniqueOrThrow: jest.fn().mockResolvedValue(activeModule),
      },
      organization: {
        findMany: jest.fn().mockResolvedValue([]),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ status: "ACTIVE" }),
      },
      moduleInstallation: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }: any) => ({ id: "inst-1", ...data })),
        update: jest.fn(async ({ data }: any) => ({ id: "inst-1", ...data })),
      },
      ...extra,
    } as any;
  }

  it("rejects installing a deprecated module (6.10.3)", async () => {
    const { kernel } = buildKernel(
      installPrisma({
        moduleDefinition: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ ...activeModule, status: "DEPRECATED" }),
        },
      }),
    );
    const error = await kernel
      .installModule("org-1", "reuniones")
      .catch((e) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.message).toContain("discontinuado");
  });

  it("validates the configuration sent with the install and stores it with defaults", async () => {
    const prisma = installPrisma();
    const { kernel } = buildKernel(prisma);
    await expect(
      kernel.installModule("org-1", "reuniones", {
        configuration: { emailContacto: "no" },
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    await kernel.installModule("org-1", "reuniones", {
      configuration: { emailContacto: "club@example.org" },
    });
    expect(prisma.moduleInstallation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        configuration: {
          emailContacto: "club@example.org",
          votosPorClub: 1,
          avisarPorEmail: true,
          idioma: "es",
        },
      }),
    });
  });

  it("refuses a second installation but reinstalls a disabled one in place", async () => {
    const pending = installPrisma({
      moduleInstallation: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: "inst-1", status: "ACTIVE" }),
      },
    });
    await expect(
      buildKernel(pending).kernel.installModule("org-1", "reuniones"),
    ).rejects.toBeInstanceOf(ConflictException);

    const disabled = installPrisma();
    disabled.moduleInstallation.findUnique.mockResolvedValue({
      id: "inst-1",
      status: "DISABLED",
    });
    await buildKernel(disabled).kernel.installModule("org-1", "reuniones");
    expect(disabled.moduleInstallation.update).toHaveBeenCalledWith({
      where: { id: "inst-1" },
      data: expect.objectContaining({ status: "PENDING", activatedAt: null }),
    });
  });

  it("validates the configuration schema when activating (6.10.4), with a Spanish 422", async () => {
    const prisma = installPrisma();
    prisma.moduleInstallation.findUnique.mockResolvedValue({
      status: "PENDING",
      configuration: null,
    });
    const { kernel } = buildKernel(prisma);
    const error = await kernel
      .transitionInstallation("org-1", "reuniones", "ACTIVE" as any)
      .catch((e) => e);
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error.getResponse()).toMatchObject({
      code: "KERNEL_MODULE_CONFIGURATION_INVALID",
      errors: [
        {
          path: "emailContacto",
          message: "Falta completar «Email de contacto del club».",
        },
      ],
    });
    expect(error.message).toMatch(/^Antes de activar el módulo/);
  });

  it("refuses to configure an uninstalled module", async () => {
    const prisma = installPrisma();
    prisma.moduleInstallation.findUnique.mockResolvedValue({
      status: "DISABLED",
      module: activeModule,
    });
    await expect(
      buildKernel(prisma).kernel.updateInstallationConfiguration(
        "org-1",
        "reuniones",
        { emailContacto: "club@example.org" },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("stores a valid configuration update with defaults", async () => {
    const prisma = installPrisma();
    prisma.moduleInstallation.findUnique.mockResolvedValue({
      status: "ACTIVE",
      module: activeModule,
    });
    await buildKernel(prisma).kernel.updateInstallationConfiguration(
      "org-1",
      "reuniones",
      { emailContacto: "club@example.org", idioma: "pt" },
    );
    expect(prisma.moduleInstallation.update).toHaveBeenCalledWith({
      where: {
        moduleId_organizationId: {
          moduleId: "reuniones",
          organizationId: "org-1",
        },
      },
      data: {
        configuration: {
          emailContacto: "club@example.org",
          idioma: "pt",
          votosPorClub: 1,
          avisarPorEmail: true,
        },
      },
    });
  });
});
