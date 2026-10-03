import { AssignmentEffect, ScopeType } from "@prisma/client";

import { AuthorizationService } from "../authorization/authorization.service";

/**
 * E8: a module permission only takes effect where the module is turned on.
 * Tree: district-1 → club-a, club-b.
 */
function buildService(options: {
  installations?: Record<string, string>;
  moduleStatus?: string;
  superadmin?: boolean;
  scopeOrg?: string;
}) {
  const parents: Record<string, string | null> = {
    "district-1": null,
    "club-a": "district-1",
    "club-b": "district-1",
  };
  const prisma: any = {
    person: {
      findUnique: jest.fn().mockResolvedValue({
        account: options.superadmin
          ? { id: "acc-1", platformRole: "SUPERADMIN" }
          : null,
      }),
    },
    roleAssignment: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: "assignment-1",
          effect: AssignmentEffect.ALLOW,
          scopeType: ScopeType.ORGANIZATION_TREE,
          organizationId: options.scopeOrg ?? "district-1",
          periodId: null,
          roleDefinition: {
            permissions: [
              { permissionDefinition: { code: "reuniones.vote.cast" } },
              { permissionDefinition: { code: "kernel.widget.read" } },
            ],
          },
        },
      ]),
    },
    permissionDefinition: {
      findUnique: jest.fn(async ({ where }: any) =>
        where.code.startsWith("reuniones.")
          ? { moduleId: "reuniones" }
          : { moduleId: null },
      ),
    },
    moduleDefinition: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ status: options.moduleStatus ?? "ACTIVE" }),
    },
    moduleInstallation: {
      findUnique: jest.fn(async ({ where }: any) => {
        const status =
          options.installations?.[where.moduleId_organizationId.organizationId];
        return status ? { status } : null;
      }),
    },
    organization: {
      findUnique: jest.fn(async ({ where }: any) => ({
        parentId: parents[where.id] ?? null,
      })),
    },
    kernelAuditLog: { create: jest.fn() },
  };
  const cache = {
    get: jest.fn().mockResolvedValue(undefined),
    set: jest.fn(),
    del: jest.fn(),
  };
  return new AuthorizationService(prisma, cache as any);
}

const check = (service: AuthorizationService, organizationId?: string) =>
  service.check({
    personId: "person-1",
    permissionCode: "reuniones.vote.cast",
    organizationId,
  });

describe("AuthorizationService — module permissions need the module turned on (E8)", () => {
  it("allows where the module is ACTIVE in the organization", async () => {
    const service = buildService({ installations: { "club-a": "ACTIVE" } });
    const decision = await check(service, "club-a");
    expect(decision.allowed).toBe(true);
    expect(decision.reasonCodes).toEqual(["ROLE_ALLOWED"]);
  });

  it("denies where the module is not installed", async () => {
    const service = buildService({ installations: { "club-a": "ACTIVE" } });
    const decision = await check(service, "club-b");
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCodes).toEqual(["MODULE_NOT_INSTALLED"]);
  });

  it("a district installation covers its clubs", async () => {
    const service = buildService({ installations: { "district-1": "ACTIVE" } });
    expect((await check(service, "club-b")).allowed).toBe(true);
  });

  it("the club's own installation wins over the district's", async () => {
    const service = buildService({
      installations: { "district-1": "ACTIVE", "club-a": "SUSPENDED" },
    });
    const decision = await check(service, "club-a");
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCodes).toEqual(["MODULE_NOT_ACTIVE"]);
    // A DISABLED club installation means "not installed here": fall back.
    const fallback = buildService({
      installations: { "district-1": "ACTIVE", "club-a": "DISABLED" },
    });
    expect((await check(fallback, "club-a")).allowed).toBe(true);
  });

  it("a disabled module grants nothing anywhere, not even to SUPERADMIN", async () => {
    const service = buildService({
      installations: { "club-a": "ACTIVE" },
      moduleStatus: "DISABLED",
      superadmin: true,
    });
    const decision = await check(service, "club-a");
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCodes).toEqual(["MODULE_DISABLED"]);
  });

  it("never touches kernel permissions", async () => {
    const service = buildService({});
    const decision = await service.check({
      personId: "person-1",
      permissionCode: "kernel.widget.read",
      organizationId: "club-b",
    });
    expect(decision.allowed).toBe(true);
  });

  it("does not turn a denial into anything else", async () => {
    const service = buildService({
      installations: { "club-a": "ACTIVE" },
      scopeOrg: "other-district",
    });
    const decision = await check(service, "club-a");
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCodes).toEqual(["NO_GRANT"]);
  });
});
