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
      organization: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: "org-1", type: "CLUB", status: "ACTIVE" }),
      },
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

  it("binds a self-service application to the authenticated person, never to input", async () => {
    const { kernel, prisma } = buildKernel({
      organization: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: "club-1", type: "CLUB", status: "ACTIVE" }),
      },
      organizationMembership: { findUnique: jest.fn().mockResolvedValue(null) },
      membershipApplication: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }: any) => ({
          id: "application-1",
          ...data,
        })),
      },
    });

    await kernel.createApplication(
      {
        organizationId: "club-1",
        requesterPersonId: "forged-person-id",
        message: "Quiero sumarme",
      },
      {
        commandId: "command-1",
        actor: { type: "USER", id: "actual-person-id" },
        correlationId: "correlation-1",
      },
    );

    expect(prisma.membershipApplication.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          requesterPersonId: "actual-person-id",
        }),
      }),
    );
  });

  it("approves an application by creating an ACTIVE membership and its history", async () => {
    const application = {
      id: "application-1",
      organizationId: "club-1",
      requesterPersonId: "person-1",
      status: "SUBMITTED",
      membershipId: null,
      submittedAt: new Date(),
      reviewedAt: null,
      reviewedById: null,
      rejectionReason: null,
    };
    const { kernel, prisma, outbox } = buildKernel({
      membershipApplication: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(application),
        update: jest.fn().mockImplementation(({ data }: any) => ({
          ...application,
          ...data,
        })),
      },
      organizationMembership: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: "membership-1" }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          personId: "person-1",
          organizationId: "club-1",
          status: "ACTIVE",
        }),
      },
      membershipTransition: { create: jest.fn().mockResolvedValue({}) },
      roleDefinition: {
        findUnique: jest.fn().mockResolvedValue({ id: "member-role" }),
      },
      roleAssignment: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
      },
    });

    const approved = await kernel.transitionApplication(
      "application-1",
      "APPROVED",
      {},
      {
        commandId: "command-1",
        actor: { type: "USER", id: "president-person-id" },
        correlationId: "correlation-1",
      },
    );

    expect(prisma.organizationMembership.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "ACTIVE",
          personId: "person-1",
        }),
      }),
    );
    expect(prisma.membershipTransition.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ toStatus: "ACTIVE", type: "CREATED" }),
      }),
    );
    expect(prisma.roleAssignment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        personId: "person-1",
        roleDefinitionId: "member-role",
        scopeType: "ORGANIZATION",
        organizationId: "club-1",
      }),
    });
    expect(outbox.record).toHaveBeenCalledWith(
      expect.anything(),
      "kernel.membership-application.approved.v1",
      "MembershipApplication",
      "application-1",
      expect.objectContaining({
        membershipId: "membership-1",
        reviewedById: "president-person-id",
      }),
      expect.anything(),
      "club-1",
    );
    expect(approved.membershipId).toBe("membership-1");
  });
});

// Module invariants (6.10) and E8 behaviour: src/application/modules/modules.spec.ts

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

describe("KernelService — input allowlists (mass assignment)", () => {
  it("drops parentId/type/status from an organization update", async () => {
    const update = jest.fn().mockResolvedValue({ id: "club-1" });
    const { kernel } = buildKernel({ organization: { update } });

    await kernel.updateOrganization("club-1", {
      name: "Rotaract Asunción",
      parentId: null,
      type: "DISTRICT",
      status: "ARCHIVED",
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: "club-1" },
      data: { name: "Rotaract Asunción" },
    });
  });

  it("never lets a grant set revocation or provenance fields", async () => {
    const create = jest.fn().mockResolvedValue({ id: "ra-1", personId: "p-1" });
    const { kernel } = buildKernel({ roleAssignment: { create } });

    await kernel.grantRole({
      personId: "p-1",
      roleDefinitionId: "role-1",
      scopeType: "ORGANIZATION",
      organizationId: "club-1",
      revokedAt: null,
      sourceAppointmentId: "forged",
    });

    const data = create.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("sourceAppointmentId");
    expect(data).not.toHaveProperty("revokedAt");
  });

  it("never lets a caller register a system permission", async () => {
    const create = jest.fn().mockResolvedValue({ id: "perm-1" });
    const { kernel } = buildKernel({ permissionDefinition: { create } });

    await kernel.createPermission({
      code: "kernel.widget.read",
      namespace: "kernel",
      isSystem: true,
    });

    expect(create.mock.calls[0][0].data).not.toHaveProperty("isSystem");
  });
});

describe("KernelService — club-owned positions", () => {
  const clubOwner = {
    organization: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ type: "CLUB" }),
    },
  };

  it("rejects a club defining a district position", async () => {
    const { kernel } = buildKernel({ ...clubOwner });

    await expect(
      kernel.createPosition({
        code: "X",
        name: "X",
        organizationType: "DISTRICT",
        ownerOrganizationId: "club-1",
        editPermissionCode: "kernel.position.manage",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a club position deriving a system role", async () => {
    const { kernel } = buildKernel({
      ...clubOwner,
      roleDefinition: {
        findUnique: jest.fn().mockResolvedValue({ isSystem: true }),
      },
    });

    await expect(
      kernel.createPosition({
        code: "X",
        name: "X",
        organizationType: "CLUB",
        ownerOrganizationId: "club-1",
        editPermissionCode: "kernel.position.manage",
        defaultRoleCode: "DISTRICT_RDR",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("refuses to edit a role shared with another organization's positions", async () => {
    const { kernel } = buildKernel({
      positionDefinition: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: "pos-1",
          defaultRoleCode: "SHARED",
          ownerOrganizationId: "club-1",
        }),
        count: jest.fn().mockResolvedValue(1),
      },
      roleDefinition: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "role-1" }),
      },
    });

    await expect(
      kernel.positionPermission("pos-1", "perm-1", true),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("refuses a district-only permission on a club position", async () => {
    const { kernel } = buildKernel({
      positionDefinition: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: "pos-1",
          defaultRoleCode: "CLUB_OWN",
          ownerOrganizationId: "club-1",
        }),
        count: jest.fn().mockResolvedValue(0),
      },
      roleDefinition: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "role-1" }),
      },
      organization: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ type: "CLUB" }),
      },
      permissionDefinition: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ code: "kernel.organization.move" }),
      },
    });

    await expect(
      kernel.positionPermission("pos-1", "perm-1", true),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe("KernelService — positions that grant permissions", () => {
  const districtOwner = {
    organization: {
      findMany: jest.fn().mockResolvedValue([]),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ type: "DISTRICT" }),
    },
  };
  const districtPosition = {
    code: "DISTRICT_ROTAMERCH_DIRECTOR",
    name: "Dirección de RotaMerch",
    organizationType: "DISTRICT",
    ownerOrganizationId: "district-1",
    editPermissionCode: "kernel.position.manage",
    isSingletonPerPeriod: true,
  };

  it("creates a role of the position's own with grantsPermissions", async () => {
    const roleCreate = jest.fn().mockResolvedValue({ id: "role-new" });
    const positionCreate = jest
      .fn()
      .mockImplementation(({ data }: any) => ({ id: "pos-1", ...data }));
    const { kernel } = buildKernel({
      ...districtOwner,
      roleDefinition: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: roleCreate,
      },
      positionDefinition: { create: positionCreate },
    });

    const position = await kernel.createPosition({
      ...districtPosition,
      grantsPermissions: true,
    });

    expect(roleCreate).toHaveBeenCalledWith({
      data: {
        code: "DISTRICT_ROTAMERCH_DIRECTOR",
        name: "Dirección de RotaMerch",
        description: null,
        isSystem: false,
      },
    });
    const data = positionCreate.mock.calls[0][0].data;
    expect(data.defaultRoleCode).toBe("DISTRICT_ROTAMERCH_DIRECTOR");
    expect(data).not.toHaveProperty("grantsPermissions");
    expect(position.defaultRoleCode).toBe("DISTRICT_ROTAMERCH_DIRECTOR");
  });

  it("needs an owner organization for grantsPermissions", async () => {
    const { kernel } = buildKernel({});
    const { ownerOrganizationId, ...unowned } = districtPosition;
    void ownerOrganizationId;
    await expect(
      kernel.createPosition({ ...unowned, grantsPermissions: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("refuses grantsPermissions when a role with that code exists (it would be shared)", async () => {
    const { kernel } = buildKernel({
      ...districtOwner,
      roleDefinition: {
        findUnique: jest.fn().mockResolvedValue({ id: "role-x" }),
      },
    });
    await expect(
      kernel.createPosition({ ...districtPosition, grantsPermissions: true }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects a district position pointing at a role that doesn't exist", async () => {
    const { kernel } = buildKernel({
      ...districtOwner,
      roleDefinition: { findUnique: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      kernel.createPosition({
        ...districtPosition,
        defaultRoleCode: "NO_SUCH_ROLE",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("turns an informational position into one with permissions and grants the role to who already holds it", async () => {
    const roleCreate = jest.fn().mockResolvedValue({ id: "role-new" });
    const assignmentCreate = jest.fn().mockResolvedValue({ id: "ra-1" });
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const { kernel } = buildKernel({
      positionDefinition: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: "pos-t",
          code: "DISTRICT_TREASURER",
          name: "Tesorería distrital",
          description: null,
          defaultRoleCode: null,
          ownerOrganizationId: "district-1",
          ownerOrganization: { type: "DISTRICT" },
        }),
        update: jest.fn().mockImplementation(({ data }: any) => ({
          id: "pos-t",
          defaultRoleCode: data.defaultRoleCode,
        })),
      },
      roleDefinition: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null) // the code is free
          .mockResolvedValue({ id: "role-new" }), // resync reads it back
        create: roleCreate,
      },
      appointment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "appt-1",
            organizationId: "district-1",
            periodId: "period-1",
            membership: { personId: "person-1" },
            positionDefinition: { organizationType: "DISTRICT" },
          },
        ]),
      },
      roleAssignment: {
        updateMany,
        findFirst: jest.fn().mockResolvedValue(null),
        create: assignmentCreate,
      },
    });

    const updated = await kernel.updatePosition("pos-t", {
      grantsPermissions: true,
    });

    expect(updated.defaultRoleCode).toBe("DISTRICT_TREASURER");
    expect(roleCreate).toHaveBeenCalled();
    expect(assignmentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        personId: "person-1",
        roleDefinitionId: "role-new",
        scopeType: "ORGANIZATION_TREE",
        organizationId: "district-1",
        periodId: "period-1",
        sourceAppointmentId: "appt-1",
      }),
    });
  });

  it("refuses grantsPermissions on a position that already derives a role", async () => {
    const { kernel } = buildKernel({
      positionDefinition: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: "pos-1",
          code: "DISTRICT_SECRETARY",
          defaultRoleCode: "DISTRICT_SECRETARY",
          ownerOrganizationId: "district-1",
          ownerOrganization: { type: "DISTRICT" },
        }),
      },
    });
    await expect(
      kernel.updatePosition("pos-1", { grantsPermissions: true }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("moves ACTIVE appointments to the new role when the role changes", async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const assignmentCreate = jest.fn();
    const { kernel } = buildKernel({
      positionDefinition: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: "pos-1",
          code: "X",
          defaultRoleCode: "OLD_ROLE",
          ownerOrganizationId: "district-1",
          ownerOrganization: { type: "DISTRICT" },
        }),
        update: jest
          .fn()
          .mockResolvedValue({ id: "pos-1", defaultRoleCode: "NEW_ROLE" }),
      },
      roleDefinition: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: "role-new", isSystem: false }),
      },
      appointment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "appt-1",
            organizationId: "district-1",
            periodId: "period-1",
            membership: { personId: "person-1" },
            positionDefinition: { organizationType: "DISTRICT" },
          },
        ]),
      },
      roleAssignment: {
        updateMany,
        findFirst: jest.fn().mockResolvedValue(null),
        create: assignmentCreate,
      },
    });

    await kernel.updatePosition("pos-1", { defaultRoleCode: "NEW_ROLE" });

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        sourceAppointmentId: "appt-1",
        revokedAt: null,
        roleDefinitionId: { not: "role-new" },
      },
      data: expect.objectContaining({ revokedAt: expect.any(Date) }),
    });
    expect(assignmentCreate).toHaveBeenCalled();
  });
});

describe("KernelService — MEMBER role follows the membership", () => {
  function membershipKernel(
    status: string,
    held: number,
    openAppointments: Array<{ id: string; status: string }> = [],
  ) {
    const roleAssignment = {
      count: jest.fn().mockResolvedValue(held),
      create: jest.fn(),
      updateMany: jest.fn(),
    };
    const appointment = {
      findMany: jest.fn().mockResolvedValue(
        openAppointments.map((a) => ({
          ...a,
          organizationId: "club-1",
          membership: { personId: "p-1" },
        })),
      ),
      update: jest.fn(),
    };
    const built = buildKernel({
      organizationMembership: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValueOnce({
            id: "m-1",
            status: status === "ACTIVE" ? "PENDING" : "ACTIVE",
          })
          .mockResolvedValue({
            personId: "p-1",
            organizationId: "club-1",
            status,
          }),
        update: jest.fn().mockResolvedValue({ id: "m-1", status }),
      },
      membershipTransition: { create: jest.fn() },
      roleDefinition: {
        findUnique: jest.fn().mockResolvedValue({ id: "member-role" }),
      },
      roleAssignment,
      appointment,
    });
    return { ...built, roleAssignment, appointment };
  }

  it("grants MEMBER, scoped to the club, when a membership becomes ACTIVE", async () => {
    const { kernel, roleAssignment } = membershipKernel("ACTIVE", 0);

    await kernel.transitionMembership(
      "m-1",
      "ACTIVE" as any,
      "ACTIVATED" as any,
    );

    expect(roleAssignment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        personId: "p-1",
        roleDefinitionId: "member-role",
        scopeType: "ORGANIZATION",
        organizationId: "club-1",
      }),
    });
  });

  it("revokes MEMBER when the membership ends", async () => {
    const { kernel, roleAssignment } = membershipKernel("INACTIVE", 1);

    await kernel.transitionMembership(
      "m-1",
      "INACTIVE" as any,
      "DEACTIVATED" as any,
    );

    expect(roleAssignment.updateMany).toHaveBeenCalled();
    expect(roleAssignment.create).not.toHaveBeenCalled();
  });

  it("ends the active mandate and revokes pending ones when the membership ends", async () => {
    const { kernel, roleAssignment, appointment, outbox } = membershipKernel(
      "INACTIVE",
      0,
      [
        { id: "appt-active", status: "ACTIVE" },
        { id: "appt-elected", status: "ELECTED" },
      ],
    );

    await kernel.transitionMembership(
      "m-1",
      "INACTIVE" as any,
      "DEACTIVATED" as any,
    );

    expect(appointment.update).toHaveBeenCalledWith({
      where: { id: "appt-active" },
      data: expect.objectContaining({ status: "ENDED" }),
    });
    expect(appointment.update).toHaveBeenCalledWith({
      where: { id: "appt-elected" },
      data: expect.objectContaining({ status: "REVOKED" }),
    });
    expect(roleAssignment.updateMany).toHaveBeenCalledWith({
      where: { sourceAppointmentId: "appt-active", revokedAt: null },
      data: expect.objectContaining({ revokedAt: expect.any(Date) }),
    });
    const events = (outbox.record as jest.Mock).mock.calls.map((c) => c[1]);
    expect(events).toEqual(
      expect.arrayContaining([
        "kernel.appointment.ended.v1",
        "kernel.appointment.revoked.v1",
      ]),
    );
  });

  it("keeps the mandate while the member is only on leave", async () => {
    const { kernel, appointment } = membershipKernel("ON_LEAVE", 1, [
      { id: "appt-active", status: "ACTIVE" },
    ]);

    await kernel.transitionMembership(
      "m-1",
      "ON_LEAVE" as any,
      "LEAVE_STARTED" as any,
    );

    expect(appointment.findMany).not.toHaveBeenCalled();
  });
});
