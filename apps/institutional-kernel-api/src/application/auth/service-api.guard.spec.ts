import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";

import { ServiceApiGuard, type ServiceRequest } from "./service-api.guard";

function buildContext(handlerName: string, request: any): ExecutionContext {
  return {
    getHandler: () => ({ name: handlerName }),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function buildRequest(overrides: Partial<any> = {}) {
  return { headers: {}, params: {}, body: {}, ...overrides };
}

const bearer = (extra: Partial<any> = {}) =>
  buildRequest({ headers: { authorization: "Bearer token" }, ...extra });

// district -> clubA, clubB; clubA -> projectA (a nested organization)
const children: Record<string, string[]> = {
  district: ["clubA", "clubB"],
  clubA: ["projectA"],
};

function setup(
  options: {
    claims?: Record<string, unknown>;
    verifyFails?: boolean;
    app?: { status: string; organizationId: string } | null;
    memberships?: Array<{ personId: string; organizationId: string }>;
    accounts?: Record<string, string>;
  } = {},
) {
  const claims = {
    sub: "app:mra_1",
    client_id: "mra_1",
    token_use: "service",
    scope: "kernel.service.organizations.read kernel.service.persons.read",
    org: "clubA",
    ...options.claims,
  };
  const keys = {
    verify: options.verifyFails
      ? jest.fn().mockRejectedValue(new Error("bad signature"))
      : jest.fn().mockResolvedValue(claims),
  };
  const memberships = options.memberships ?? [];
  const prisma = {
    developerApp: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          options.app === undefined
            ? { status: "ACTIVE", organizationId: claims.org }
            : options.app,
        ),
    },
    organization: {
      findMany: jest.fn(async ({ where }: any) =>
        (where.parentId.in as string[]).flatMap((id) =>
          (children[id] ?? []).map((child) => ({ id: child })),
        ),
      ),
    },
    organizationMembership: {
      findFirst: jest.fn(
        async ({ where }: any) =>
          memberships.find(
            (m) =>
              m.personId === where.personId &&
              where.organizationId.in.includes(m.organizationId),
          ) ?? null,
      ),
    },
    userAccount: {
      findUnique: jest.fn(async ({ where }: any) =>
        options.accounts?.[where.id]
          ? { personId: options.accounts[where.id] }
          : null,
      ),
    },
  };
  return {
    guard: new ServiceApiGuard(prisma as any, keys as any),
    keys,
    prisma,
  };
}

describe("ServiceApiGuard — developer-app service tokens", () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("verifies against the Kernel audience and attaches the app's scope", async () => {
    const { guard, keys } = setup();
    const request = bearer({ params: { organizationId: "clubA" } });

    await expect(
      guard.canActivate(buildContext("organization", request)),
    ).resolves.toBe(true);
    expect(keys.verify).toHaveBeenCalledWith("token", {
      audience: "institutional-kernel",
    });
    expect((request as unknown as ServiceRequest).service).toEqual({
      id: "app:mra_1",
      clientId: "mra_1",
      scopes: [
        "kernel.service.organizations.read",
        "kernel.service.persons.read",
      ],
      organizationId: "clubA",
      allowedOrganizationIds: ["clubA", "projectA"],
    });
  });

  it("computes allowedOrganizationIds as the org plus every descendant", async () => {
    const { guard } = setup({ claims: { org: "district" } });
    const request = bearer({ params: { organizationId: "projectA" } });

    await guard.canActivate(buildContext("organization", request));

    const allowed = (request as unknown as ServiceRequest).service
      .allowedOrganizationIds;
    expect(allowed).toEqual(
      expect.arrayContaining(["district", "clubA", "clubB", "projectA"]),
    );
    expect(allowed).toHaveLength(4);
  });

  it("rejects tokens that fail verification (e.g. legacy HS256 JWT_SECRET tokens)", async () => {
    const { guard } = setup({ verifyFails: true });
    await expect(
      guard.canActivate(buildContext("organization", bearer())),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects a token that is not a service token", async () => {
    const { guard } = setup({ claims: { token_use: "user" } });
    await expect(
      guard.canActivate(buildContext("organization", bearer())),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it.each([
    ["suspended", { status: "SUSPENDED", organizationId: "clubA" }],
    ["revoked", { status: "REVOKED", organizationId: "clubA" }],
    ["deleted", null],
  ])("rejects a still-valid token of a %s app", async (_label, app) => {
    const { guard } = setup({ app });
    await expect(
      guard.canActivate(
        buildContext(
          "organization",
          bearer({ params: { organizationId: "clubA" } }),
        ),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects a token missing the scope required by the endpoint", async () => {
    const { guard } = setup();
    await expect(
      guard.canActivate(
        buildContext(
          "membership",
          bearer({ params: { organizationId: "clubA" } }),
        ),
      ),
    ).rejects.toThrow(
      "missing required scope: kernel.service.memberships.read",
    );
  });

  it.each(["clubB", "district"])(
    "denies a club-bound app access to organization %s",
    async (organizationId) => {
      const { guard } = setup();
      await expect(
        guard.canActivate(
          buildContext("organization", bearer({ params: { organizationId } })),
        ),
      ).rejects.toThrow(
        new ForbiddenException("Fuera del alcance de esta app"),
      );
    },
  );

  it("allows a person with a membership inside the tree and denies one outside", async () => {
    const { guard } = setup({
      memberships: [
        { personId: "inside", organizationId: "projectA" },
        { personId: "outside", organizationId: "clubB" },
      ],
    });
    await expect(
      guard.canActivate(
        buildContext("person", bearer({ params: { personId: "inside" } })),
      ),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(
        buildContext("person", bearer({ params: { personId: "outside" } })),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("scopes accounts through their person, and unknown accounts are out of scope", async () => {
    const { guard } = setup({
      claims: { scope: "kernel.service.users.read" },
      memberships: [{ personId: "p1", organizationId: "clubA" }],
      accounts: { acc1: "p1", acc2: "p2" },
    });
    await expect(
      guard.canActivate(
        buildContext("userContext", bearer({ params: { accountId: "acc1" } })),
      ),
    ).resolves.toBe(true);
    for (const accountId of ["acc2", "missing"])
      await expect(
        guard.canActivate(
          buildContext("userContext", bearer({ params: { accountId } })),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("requires every organization of authorization checks to be in the tree", async () => {
    const { guard } = setup({
      claims: { scope: "kernel.service.authorization.check" },
    });
    const check = (body: unknown) =>
      guard.canActivate(buildContext("check", bearer({ body })));
    const batch = (body: unknown) =>
      guard.canActivate(buildContext("batch", bearer({ body })));

    await expect(
      check({ scope: { organizationId: "projectA" } }),
    ).resolves.toBe(true);
    await expect(check({ organizationId: "clubA" })).resolves.toBe(true);
    await expect(check({ organizationId: "clubB" })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    // No organization = a platform-wide question, outside any bound app.
    await expect(check({ subjectId: "p1" })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      batch({
        checks: [
          { scope: { organizationId: "clubA" } },
          { scope: { organizationId: "district" } },
        ],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      batch({ checks: [{ scope: { organizationId: "clubA" } }] }),
    ).resolves.toBe(true);
  });

  it("accepts the x-service-api-key bypass outside production, unrestricted", async () => {
    process.env.KERNEL_SERVICE_API_KEY = "dev-secret";
    delete process.env.NODE_ENV;
    const { guard, prisma } = setup();
    const request = buildRequest({
      headers: { "x-service-api-key": "dev-secret" },
      params: { organizationId: "anywhere" },
    });

    await expect(
      guard.canActivate(buildContext("organization", request)),
    ).resolves.toBe(true);
    expect((request as unknown as ServiceRequest).service).toEqual({
      id: "dev-api-key",
      scopes: ["*"],
    });
    expect(prisma.developerApp.findUnique).not.toHaveBeenCalled();
  });

  it("never honors the x-service-api-key bypass in production, even with a matching key", async () => {
    process.env.KERNEL_SERVICE_API_KEY = "dev-secret";
    process.env.NODE_ENV = "production";
    const { guard } = setup();
    const request = buildRequest({
      headers: { "x-service-api-key": "dev-secret" },
    });

    await expect(
      guard.canActivate(buildContext("userContext", request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects requests with neither a token nor a matching api key", async () => {
    const { guard } = setup();
    await expect(
      guard.canActivate(buildContext("userContext", buildRequest())),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
