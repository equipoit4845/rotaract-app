import { AssignmentEffect, ScopeType } from "@prisma/client";

import { AuthorizationService } from "./authorization.service";

function buildService(overrides: { person?: any; assignments?: any[] }) {
  const prisma: any = {
    person: {
      findUnique: jest
        .fn()
        .mockResolvedValue(overrides.person ?? { account: null }),
    },
    roleAssignment: {
      findMany: jest.fn().mockResolvedValue(overrides.assignments ?? []),
    },
    kernelAuditLog: { create: jest.fn() },
  };
  const cache = {
    get: jest.fn().mockResolvedValue(undefined),
    set: jest.fn(),
    del: jest.fn(),
  };
  const service = new AuthorizationService(prisma, cache as any);
  return { service, prisma, cache };
}

function assignment(overrides: Partial<any> = {}) {
  return {
    id: "assignment-1",
    effect: AssignmentEffect.ALLOW,
    scopeType: ScopeType.ORGANIZATION,
    organizationId: "org-1",
    periodId: null,
    roleDefinition: {
      permissions: [{ permissionDefinition: { code: "kernel.widget.read" } }],
    },
    ...overrides,
  };
}

describe("AuthorizationService.check — response contract (§9.8)", () => {
  it("returns the full decision contract on an ALLOW grant", async () => {
    const { service } = buildService({ assignments: [assignment()] });

    const decision = await service.check({
      personId: "person-1",
      permissionCode: "kernel.widget.read",
      organizationId: "org-1",
    });

    expect(decision.allowed).toBe(true);
    expect(decision.subjectId).toBe("person-1");
    expect(decision.permission).toBe("kernel.widget.read");
    expect(decision.matchedAssignments).toEqual(["assignment-1"]);
    expect(decision.reasonCodes).toEqual(["ROLE_ALLOWED"]);
    expect(typeof decision.decisionId).toBe("string");
    expect(decision.decisionId).not.toHaveLength(0);
    expect(new Date(decision.evaluatedAt).toString()).not.toBe("Invalid Date");
    expect(new Date(decision.cacheUntil!).toString()).not.toBe("Invalid Date");
  });

  it("lets an EXPLICIT_DENY at equal specificity win over an ALLOW", async () => {
    const { service } = buildService({
      assignments: [
        assignment({ id: "allow-1", effect: AssignmentEffect.ALLOW }),
        assignment({ id: "deny-1", effect: AssignmentEffect.DENY }),
      ],
    });

    const decision = await service.check({
      personId: "person-1",
      permissionCode: "kernel.widget.read",
      organizationId: "org-1",
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCodes).toEqual(["EXPLICIT_DENY"]);
    expect(decision.matchedAssignments).toEqual(["deny-1"]);
  });

  it("returns NO_GRANT with no matched assignments when nothing applies", async () => {
    const { service } = buildService({ assignments: [] });

    const decision = await service.check({
      personId: "person-1",
      permissionCode: "kernel.widget.read",
      organizationId: "org-1",
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCodes).toEqual(["NO_GRANT"]);
    expect(decision.matchedAssignments).toEqual([]);
  });

  it("bypasses and audits SUPERADMIN, tagging the decision accordingly", async () => {
    const { service, prisma } = buildService({
      person: { account: { id: "account-1", platformRole: "SUPERADMIN" } },
    });

    const decision = await service.check({
      personId: "person-1",
      permissionCode: "kernel.widget.read",
    });

    expect(decision.allowed).toBe(true);
    expect(decision.reasonCodes).toEqual(["SUPERADMIN_BYPASS"]);
    expect(prisma.kernelAuditLog.create).toHaveBeenCalled();
  });

  it("does not cache and omits cacheUntil for a point-in-time historical check", async () => {
    const { service, cache } = buildService({ assignments: [assignment()] });

    const decision = await service.check({
      personId: "person-1",
      permissionCode: "kernel.widget.read",
      organizationId: "org-1",
      at: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(decision.cacheUntil).toBeUndefined();
    expect(cache.set).not.toHaveBeenCalled();
  });
});
