import { ForbiddenException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";

import { KernelAccessGuard } from "./kernel-access.guard";

function buildContext(
  handlerName: string,
  controllerName: string,
  request: any,
): ExecutionContext {
  return {
    getHandler: () => ({ name: handlerName }),
    getClass: () => ({ name: controllerName }),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function buildRequest(overrides: Record<string, any> = {}): any {
  return {
    params: {},
    body: {},
    query: {} as Record<string, unknown>,
    header: jest.fn().mockReturnValue("idem-key"),
    user: { personId: "person-1" },
    ...overrides,
  };
}

describe("KernelAccessGuard", () => {
  it("authorizes the district that owns a position catalog and uses its editPermissionCode (CA-POS-01/02)", async () => {
    const positionDefinition = {
      findUnique: jest.fn().mockResolvedValue({
        ownerOrganizationId: "district-a",
        editPermissionCode: "district.position.manage",
      }),
    };
    const authorization = {
      check: jest.fn().mockResolvedValue({ allowed: true, reason: "ROLE" }),
    };
    const guard = new KernelAccessGuard(
      { canActivate: jest.fn().mockResolvedValue(true) } as any,
      {} as any,
      authorization as any,
      { positionDefinition } as any,
    );
    const request = buildRequest({
      params: { positionDefinitionId: "pos-1" },
    });
    const context = buildContext(
      "updatePosition",
      "InstitutionalController",
      request,
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(authorization.check).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "district-a",
        permissionCode: "district.position.manage",
      }),
    );
  });

  it("does not authorize a district's RDR against a different district's catalog (CA-POS-03)", async () => {
    const positionDefinition = {
      findUnique: jest.fn().mockResolvedValue({
        ownerOrganizationId: "district-b",
        editPermissionCode: "kernel.position.manage",
      }),
    };
    // Simulates an assignment scoped to district-a only: any check for a
    // different organizationId is denied.
    const authorization = {
      check: jest.fn().mockImplementation(async ({ organizationId }) => ({
        allowed: organizationId === "district-a",
        reason: organizationId === "district-a" ? "ROLE" : "NO_GRANT",
      })),
    };
    const guard = new KernelAccessGuard(
      { canActivate: jest.fn().mockResolvedValue(true) } as any,
      {} as any,
      authorization as any,
      { positionDefinition } as any,
    );
    const request = buildRequest({
      params: { positionDefinitionId: "pos-1" },
    });
    const context = buildContext(
      "updatePosition",
      "InstitutionalController",
      request,
    );

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(authorization.check).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "district-b" }),
    );
  });

  it("only lets PLATFORM-scoped assignments edit system-wide position catalogs without an owner", async () => {
    const positionDefinition = {
      findUnique: jest.fn().mockResolvedValue({
        ownerOrganizationId: null,
        editPermissionCode: "kernel.position.manage",
      }),
    };
    const authorization = {
      check: jest.fn().mockResolvedValue({ allowed: true, reason: "ROLE" }),
    };
    const guard = new KernelAccessGuard(
      { canActivate: jest.fn().mockResolvedValue(true) } as any,
      {} as any,
      authorization as any,
      { positionDefinition } as any,
    );
    const request = buildRequest({
      params: { positionDefinitionId: "pos-system" },
    });
    const context = buildContext(
      "updatePosition",
      "InstitutionalController",
      request,
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(authorization.check).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: undefined }),
    );
  });

  it("resolves organizationId from the entity when a mutation route only carries the entity id (e.g. period transitions)", async () => {
    const institutionalPeriod = {
      findUnique: jest.fn().mockResolvedValue({ organizationId: "club-1" }),
    };
    const authorization = {
      check: jest.fn().mockResolvedValue({ allowed: true, reason: "ROLE" }),
    };
    const guard = new KernelAccessGuard(
      { canActivate: jest.fn().mockResolvedValue(true) } as any,
      {} as any,
      authorization as any,
      { institutionalPeriod } as any,
    );
    const request = buildRequest({ params: { periodId: "period-1" } });
    const context = buildContext(
      "activatePeriod",
      "InstitutionalController",
      request,
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(authorization.check).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "club-1" }),
    );
  });

  it("tries both sides of a membership transfer when completing/rejecting/cancelling it", async () => {
    const membershipTransfer = {
      findUnique: jest.fn().mockResolvedValue({
        fromOrganizationId: "club-origin",
        toOrganizationId: "club-destination",
      }),
    };
    const authorization = {
      check: jest.fn().mockImplementation(async ({ organizationId }) => ({
        allowed: organizationId === "club-destination",
        reason: organizationId === "club-destination" ? "ROLE" : "NO_GRANT",
      })),
    };
    const guard = new KernelAccessGuard(
      { canActivate: jest.fn().mockResolvedValue(true) } as any,
      {} as any,
      authorization as any,
      { membershipTransfer } as any,
    );
    const request = buildRequest({ params: { transferId: "transfer-1" } });
    const context = buildContext(
      "cancelTransfer",
      "WorkflowController",
      request,
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(authorization.check).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "club-origin" }),
    );
    expect(authorization.check).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "club-destination" }),
    );
  });

  it("requires kernel.account.manage (platform-wide, no organizationId) for admin account transitions", async () => {
    const authorization = {
      check: jest.fn().mockResolvedValue({ allowed: true, reason: "ROLE" }),
    };
    const guard = new KernelAccessGuard(
      { canActivate: jest.fn().mockResolvedValue(true) } as any,
      {} as any,
      authorization as any,
      {} as any,
    );
    const request = buildRequest({ params: { accountId: "account-1" } });
    const context = buildContext("suspendAccount", "AuthController", request);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(authorization.check).toHaveBeenCalledWith(
      expect.objectContaining({
        permissionCode: "kernel.account.manage",
        organizationId: undefined,
      }),
    );
  });
});

function grantOnly(codes: string[]) {
  return {
    check: jest.fn().mockImplementation(async ({ permissionCode }) => ({
      allowed: codes.includes(permissionCode),
      reason: codes.includes(permissionCode) ? "ROLE" : "NO_GRANT",
    })),
  };
}

describe("KernelAccessGuard — .self permission enforcement (kernel-openapi.yaml listMembershipApplications/Transfers)", () => {
  it("lets the requester read their own application with .read.self", async () => {
    const membershipApplication = {
      findUnique: jest.fn().mockResolvedValue({
        organizationId: "club-1",
        requesterPersonId: "person-1",
      }),
    };
    const authorization = grantOnly(["kernel.application.read.self"]);
    const guard = new KernelAccessGuard(
      { canActivate: jest.fn().mockResolvedValue(true) } as any,
      {} as any,
      authorization as any,
      { membershipApplication } as any,
    );
    const request = buildRequest({ params: { applicationId: "app-1" } });
    const context = buildContext("application", "WorkflowController", request);

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it("denies a third party reading someone else's application without kernel.application.review", async () => {
    const membershipApplication = {
      findUnique: jest.fn().mockResolvedValue({
        organizationId: "club-1",
        requesterPersonId: "person-owner",
      }),
    };
    const authorization = grantOnly(["kernel.application.read.self"]); // person-1 only has their own .self, not .review
    const guard = new KernelAccessGuard(
      { canActivate: jest.fn().mockResolvedValue(true) } as any,
      {} as any,
      authorization as any,
      { membershipApplication } as any,
    );
    const request = buildRequest({ params: { applicationId: "app-1" } });
    const context = buildContext("application", "WorkflowController", request);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("lets a reviewer read someone else's application via kernel.application.review", async () => {
    const membershipApplication = {
      findUnique: jest.fn().mockResolvedValue({
        organizationId: "club-1",
        requesterPersonId: "person-owner",
      }),
    };
    const authorization = grantOnly(["kernel.application.review"]);
    const guard = new KernelAccessGuard(
      { canActivate: jest.fn().mockResolvedValue(true) } as any,
      {} as any,
      authorization as any,
      { membershipApplication } as any,
    );
    const request = buildRequest({ params: { applicationId: "app-1" } });
    const context = buildContext("application", "WorkflowController", request);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(authorization.check).toHaveBeenCalledWith(
      expect.objectContaining({
        permissionCode: "kernel.application.review",
        organizationId: "club-1",
      }),
    );
  });

  it("lets a transfer's requester cancel it with .create.self", async () => {
    const membershipTransfer = {
      findUnique: jest.fn().mockResolvedValue({
        fromOrganizationId: "club-a",
        toOrganizationId: "club-b",
        requestedById: "person-1",
      }),
    };
    const authorization = grantOnly(["kernel.transfer.create.self"]);
    const guard = new KernelAccessGuard(
      { canActivate: jest.fn().mockResolvedValue(true) } as any,
      {} as any,
      authorization as any,
      { membershipTransfer } as any,
    );
    const request = buildRequest({ params: { transferId: "transfer-1" } });
    const context = buildContext(
      "cancelTransfer",
      "WorkflowController",
      request,
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it("lets destination-side staff read a transfer they did not request via kernel.transfer.accept", async () => {
    const membershipTransfer = {
      findUnique: jest.fn().mockResolvedValue({
        fromOrganizationId: "club-a",
        toOrganizationId: "club-b",
        requestedById: "person-owner",
      }),
    };
    const authorization = grantOnly(["kernel.transfer.accept"]);
    const guard = new KernelAccessGuard(
      { canActivate: jest.fn().mockResolvedValue(true) } as any,
      {} as any,
      authorization as any,
      { membershipTransfer } as any,
    );
    const request = buildRequest({ params: { transferId: "transfer-1" } });
    const context = buildContext("transfer", "WorkflowController", request);

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it("denies reading someone else's transfer with no self ownership and no staff permission", async () => {
    const membershipTransfer = {
      findUnique: jest.fn().mockResolvedValue({
        fromOrganizationId: "club-a",
        toOrganizationId: "club-b",
        requestedById: "person-owner",
      }),
    };
    const authorization = grantOnly([]); // holds nothing at all
    const guard = new KernelAccessGuard(
      { canActivate: jest.fn().mockResolvedValue(true) } as any,
      {} as any,
      authorization as any,
      { membershipTransfer } as any,
    );
    const request = buildRequest({ params: { transferId: "transfer-1" } });
    const context = buildContext("transfer", "WorkflowController", request);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("forces listApplications to the actor's own personId when they lack kernel.application.review", async () => {
    const authorization = grantOnly(["kernel.application.read.self"]);
    const guard = new KernelAccessGuard(
      { canActivate: jest.fn().mockResolvedValue(true) } as any,
      {} as any,
      authorization as any,
      {} as any,
    );
    const request = buildRequest({
      query: { personId: "someone-elses-id" },
    });
    const context = buildContext(
      "listApplications",
      "WorkflowController",
      request,
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.query.personId).toBe("person-1");
  });

  it("overrides the filter even when request.query is a getter that re-parses the URL on every read (Express 5 behaviour)", async () => {
    // express/lib/request.js defines `query` via Object.defineProperty
    // with only a `get` — no setter — returning a brand-new object each
    // access. A plain `request.query.x = y` would silently mutate a
    // throwaway object here; only Object.defineProperty on the instance
    // (what overrideQueryParam does) actually sticks.
    const authorization = grantOnly(["kernel.application.read.self"]);
    const guard = new KernelAccessGuard(
      { canActivate: jest.fn().mockResolvedValue(true) } as any,
      {} as any,
      authorization as any,
      {} as any,
    );
    const request = buildRequest();
    Object.defineProperty(request, "query", {
      configurable: true,
      enumerable: true,
      get: () => ({ personId: "someone-elses-id" }), // fresh object every read
    });
    const context = buildContext(
      "listApplications",
      "WorkflowController",
      request,
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.query.personId).toBe("person-1");
  });

  it("does not override the query filter for listApplications when the actor has kernel.application.review", async () => {
    const authorization = grantOnly(["kernel.application.review"]);
    const guard = new KernelAccessGuard(
      { canActivate: jest.fn().mockResolvedValue(true) } as any,
      {} as any,
      authorization as any,
      {} as any,
    );
    const request = buildRequest({
      query: { personId: "someone-elses-id", organizationId: "club-1" },
    });
    const context = buildContext(
      "listApplications",
      "WorkflowController",
      request,
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.query.personId).toBe("someone-elses-id");
  });

  it("forces listTransfers to requestedById=actor when the actor holds no staff permission", async () => {
    const authorization = grantOnly(["kernel.transfer.read.self"]);
    const guard = new KernelAccessGuard(
      { canActivate: jest.fn().mockResolvedValue(true) } as any,
      {} as any,
      authorization as any,
      {} as any,
    );
    const request = buildRequest({ query: {} });
    const context = buildContext(
      "listTransfers",
      "WorkflowController",
      request,
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.query.requestedById).toBe("person-1");
  });

  it("denies listApplications entirely for an account holding no permission at all (e.g. missing PLATFORM_USER)", async () => {
    const authorization = grantOnly([]);
    const guard = new KernelAccessGuard(
      { canActivate: jest.fn().mockResolvedValue(true) } as any,
      {} as any,
      authorization as any,
      {} as any,
    );
    const request = buildRequest({ query: {} });
    const context = buildContext(
      "listApplications",
      "WorkflowController",
      request,
    );

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
