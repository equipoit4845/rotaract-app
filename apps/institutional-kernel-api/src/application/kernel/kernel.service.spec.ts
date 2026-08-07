import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";

import { AuditService } from "../audit/audit.service";
import { AuthorizationService } from "../authorization/authorization.service";
import { OutboxService } from "../outbox/outbox.service";
import { CommandExecutorService } from "../shared/command-executor.service";
import { NotificationService } from "../notifications/notification.service";
import { OptionalRedisCacheService } from "../../infrastructure/cache/optional-redis-cache.service";
import { DomainError } from "../../domain/shared/domain.error";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { KernelService } from "./kernel.service";

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
  const notifications = {
    sendEmail: jest.fn(),
  } as unknown as NotificationService;
  // No-op cache: every read is always a miss, so tests exercise the same
  // real-database path regardless of the §15 caching layer.
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
    notifications,
    cache,
  );
  return { kernel, prisma: fakePrisma, outbox, audit, notifications, cache };
}

describe("KernelService — appointment invariants (6.6)", () => {
  it("materializes startsAt/endsAt from the period bounds when omitted", async () => {
    const period = {
      id: "period-1",
      organizationId: "club-1",
      startDate: new Date("2026-07-01T00:00:00.000Z"),
      endDate: new Date("2027-06-30T00:00:00.000Z"),
      status: "ACTIVE",
    };
    const { kernel, prisma } = buildKernel({
      organizationMembership: {
        findUnique: jest.fn().mockResolvedValue({
          id: "membership-1",
          status: "ACTIVE",
          organizationId: "club-1",
          organization: { type: "CLUB" },
          person: { archivedAt: null },
        }),
      },
      institutionalPeriod: { findUnique: jest.fn().mockResolvedValue(period) },
      positionDefinition: {
        findUnique: jest.fn().mockResolvedValue({
          id: "position-1",
          organizationType: "CLUB",
          isSingletonPerPeriod: false,
        }),
      },
      appointment: {
        create: jest.fn().mockImplementation(({ data }: any) => data),
      },
    });

    const created = await kernel.createAppointment("club-1", {
      membershipId: "membership-1",
      periodId: "period-1",
      positionDefinitionId: "position-1",
    });

    expect(prisma.appointment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          startsAt: period.startDate,
          endsAt: period.endDate,
        }),
      }),
    );
    expect(created.startsAt).toEqual(period.startDate);
  });

  it("rejects activation when the enabling membership is no longer ACTIVE", async () => {
    const { kernel } = buildKernel({
      appointment: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: "appointment-1",
          status: "ELECTED",
          organizationId: "club-1",
          periodId: "period-1",
          startsAt: new Date("2026-07-01T00:00:00.000Z"),
          endsAt: new Date("2027-06-30T00:00:00.000Z"),
          period: {
            status: "ACTIVE",
            startDate: new Date("2026-07-01T00:00:00.000Z"),
            endDate: new Date("2027-06-30T00:00:00.000Z"),
          },
          positionDefinition: { isSingletonPerPeriod: false },
          membership: { status: "ON_LEAVE", personId: "person-1" },
        }),
      },
    });

    await expect(
      kernel.transitionAppointment("appointment-1", "ACTIVE" as any),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it("rejects activation when the appointment dates fall outside the period bounds", async () => {
    const { kernel } = buildKernel({
      appointment: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: "appointment-1",
          status: "ELECTED",
          organizationId: "club-1",
          periodId: "period-1",
          startsAt: new Date("2025-01-01T00:00:00.000Z"),
          endsAt: new Date("2027-06-30T00:00:00.000Z"),
          period: {
            status: "ACTIVE",
            startDate: new Date("2026-07-01T00:00:00.000Z"),
            endDate: new Date("2027-06-30T00:00:00.000Z"),
          },
          positionDefinition: { isSingletonPerPeriod: false },
          membership: { status: "ACTIVE", personId: "person-1" },
        }),
      },
    });

    await expect(
      kernel.transitionAppointment("appointment-1", "ACTIVE" as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe("KernelService — membership application invariants (6.8)", () => {
  it("rejects a new application when the person already has an active membership (6.8.2)", async () => {
    const { kernel } = buildKernel({
      organizationMembership: {
        findUnique: jest.fn().mockResolvedValue({ status: "ACTIVE" }),
      },
    });

    await expect(
      kernel.createApplication({
        organizationId: "org-1",
        requesterPersonId: "person-1",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe("KernelService — module invariants (6.10)", () => {
  it("rejects installing a deprecated module (6.10.3)", async () => {
    const { kernel } = buildKernel({
      moduleDefinition: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ id: "mod-1", status: "DEPRECATED" }),
      },
    });

    await expect(kernel.installModule("org-1", "mod-1")).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("validates the configuration schema when activating an installation (6.10.4)", async () => {
    const { kernel } = buildKernel({
      moduleInstallation: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ status: "PENDING", configuration: null }),
      },
      moduleDefinition: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          configurationSchema: { type: "object", required: ["apiKey"] },
        }),
      },
    });

    await expect(
      kernel.transitionInstallation("org-1", "mod-1", "ACTIVE" as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("KernelService — permission and role invariants (6.7)", () => {
  it("rejects a permission code that is not <namespace>.<resource>.<action> (6.7.1)", async () => {
    const { kernel } = buildKernel({});

    await expect(
      kernel.createPermission({ code: "not-namespaced", namespace: "kernel" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a module registering a permission outside its own namespace (6.7.9)", async () => {
    const { kernel } = buildKernel({});

    await expect(
      kernel.createPermission({
        code: "other-module.widget.read",
        namespace: "other-module",
        moduleId: "this-module",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("emits kernel.permissions.changed.v1 for a well-formed RegisterPermission", async () => {
    const { kernel, outbox } = buildKernel({
      permissionDefinition: {
        create: jest.fn().mockResolvedValue({ id: "perm-1" }),
      },
    });

    await kernel.createPermission({
      code: "kernel.widget.read",
      namespace: "kernel",
    });

    const [, eventType, , , payload] = (outbox.record as jest.Mock).mock
      .calls[0];
    expect(eventType).toBe("kernel.permissions.changed.v1");
    expect(payload).toMatchObject({ permissionCode: "kernel.widget.read" });
  });

  it("rejects granting PLATFORM scope to a role that is not platform-authorized (6.7.7)", async () => {
    const { kernel } = buildKernel({
      roleDefinition: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ isSystem: false }),
      },
    });

    await expect(
      kernel.grantRole({
        scopeType: "PLATFORM",
        roleDefinitionId: "role-1",
        personId: "person-1",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("allows granting PLATFORM scope to a system role", async () => {
    const { kernel } = buildKernel({
      roleDefinition: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ isSystem: true }),
      },
      roleAssignment: {
        create: jest.fn().mockResolvedValue({ id: "assignment-1" }),
      },
    });

    await expect(
      kernel.grantRole({
        scopeType: "PLATFORM",
        roleDefinitionId: "role-1",
        personId: "person-1",
      }),
    ).resolves.toEqual({ id: "assignment-1" });
  });

  it("emits kernel.role.updated.v1 (not kernel.permissions.changed.v1) when a role's permissions change", async () => {
    const { kernel, outbox } = buildKernel({
      roleDefinition: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ code: "CLUB_PRESIDENT" }),
      },
      rolePermission: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      roleAssignment: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    });

    await kernel.rolePermission("role-1", "perm-1", true);

    const [, eventType, , , payload] = (outbox.record as jest.Mock).mock
      .calls[0];
    expect(eventType).toBe("kernel.role.updated.v1");
    expect(payload).toMatchObject({
      roleDefinitionId: "role-1",
      code: "CLUB_PRESIDENT",
    });
  });
});

describe("KernelService — service SDK snapshot contracts (§12)", () => {
  it("shapes the AuthoritySnapshot per §12.4", async () => {
    const period = { id: "period-1", status: "ACTIVE" };
    const { kernel } = buildKernel({
      institutionalPeriod: { findFirst: jest.fn().mockResolvedValue(period) },
      appointment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "appointment-1",
            status: "ACTIVE",
            periodId: "period-1",
            membershipId: "membership-1",
            startsAt: new Date("2026-07-01T00:00:00.000Z"),
            endsAt: null,
            positionDefinition: { code: "CLUB_PRESIDENT" },
            membership: { organizationId: "club-1", personId: "person-1" },
          },
        ]),
      },
    });

    const snapshot = await kernel.serviceAuthoritySnapshot("club-1");

    expect(snapshot).toMatchObject({
      organizationId: "club-1",
      periodId: "period-1",
      appointments: [
        {
          appointmentId: "appointment-1",
          positionCode: "CLUB_PRESIDENT",
          membershipId: "membership-1",
          membershipOrganizationId: "club-1",
          personId: "person-1",
          status: "ACTIVE",
        },
      ],
    });
    expect(typeof snapshot.snapshotId).toBe("string");
    expect(typeof snapshot.capturedAt).toBe("string");
  });

  it("returns currentPeriod: null (not 404) for an existing org without an active period (§12.4.1)", async () => {
    const { kernel } = buildKernel({
      organization: {
        findMany: jest.fn().mockResolvedValue([]),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "club-1" }),
      },
      institutionalPeriod: { findFirst: jest.fn().mockResolvedValue(null) },
    });

    const snapshot = await kernel.servicePeriodSnapshot("club-1");

    expect(snapshot.currentPeriod).toBeNull();
    expect(snapshot.organizationId).toBe("club-1");
  });

  it("shapes the MembershipSnapshot per §12.3", async () => {
    const { kernel } = buildKernel({
      organizationMembership: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "membership-1",
            personId: "person-1",
            status: "ACTIVE",
            person: { account: { id: "account-1" } },
          },
        ]),
      },
    });

    const snapshot = await kernel.serviceMembershipSnapshot("club-1");

    expect(snapshot).toMatchObject({
      organizationId: "club-1",
      members: [
        {
          membershipId: "membership-1",
          personId: "person-1",
          accountId: "account-1",
          status: "ACTIVE",
        },
      ],
    });
    expect(typeof snapshot.snapshotId).toBe("string");
  });
});

describe("KernelService — §15 read caches", () => {
  it("serves descendants() from cache on a hit, without re-querying the database", async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: "club-1" }]);
    const { kernel, cache } = buildKernel({
      organization: { findMany },
    });
    (cache.get as jest.Mock)
      .mockResolvedValueOnce(1) // org-tree version lookup
      .mockResolvedValueOnce([{ id: "club-1" }]); // cached descendants payload

    const result = await kernel.descendants("district-1");

    expect(result).toEqual([{ id: "club-1" }]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("bumps the org-tree cache version when an organization is created (§15.3)", async () => {
    const { kernel, cache } = buildKernel({
      organization: { create: jest.fn().mockResolvedValue({ id: "org-1" }) },
    });

    await kernel.createOrganization({ type: "DISTRICT" });

    expect(cache.set).toHaveBeenCalledWith(
      "kernel:org-tree-version:v1",
      expect.any(Number),
      3_600,
    );
  });

  it("bumps the current-period and authorities cache versions when a period is closed (§15.3)", async () => {
    const { kernel, cache } = buildKernel({
      institutionalPeriod: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: "period-1",
          organizationId: "club-1",
          status: "ACTIVE",
        }),
        update: jest.fn().mockResolvedValue({ id: "period-1" }),
      },
      appointment: { updateMany: jest.fn() },
      roleAssignment: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn(),
      },
    });

    await kernel.transitionPeriod("period-1", "CLOSED" as any);

    expect(cache.set).toHaveBeenCalledWith(
      "kernel:current-period-version:club-1:v1",
      expect.any(Number),
      3_600,
    );
    expect(cache.set).toHaveBeenCalledWith(
      "kernel:authorities-version:club-1:v1",
      expect.any(Number),
      3_600,
    );
  });
});
