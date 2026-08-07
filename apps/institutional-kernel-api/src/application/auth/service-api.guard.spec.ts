import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";

import { ServiceApiGuard } from "./service-api.guard";

function buildContext(handlerName: string, request: any): ExecutionContext {
  return {
    getHandler: () => ({ name: handlerName }),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function buildRequest(overrides: Partial<any> = {}) {
  return { headers: {}, ...overrides };
}

describe("ServiceApiGuard — technical scopes per endpoint (§14.3)", () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("allows a JWT that carries the exact required scope", async () => {
    const jwt = {
      verifyAsync: jest.fn().mockResolvedValue({
        sub: "meetings-service",
        scope: "kernel.service.users.read",
      }),
    };
    const guard = new ServiceApiGuard(jwt as any);
    const request = buildRequest({
      headers: { authorization: "Bearer valid-token" },
    });

    await expect(
      guard.canActivate(buildContext("userContext", request)),
    ).resolves.toBe(true);
  });

  it("rejects a JWT missing the scope required by the endpoint", async () => {
    const jwt = {
      verifyAsync: jest.fn().mockResolvedValue({
        sub: "meetings-service",
        scope: "kernel.service.persons.read",
      }),
    };
    const guard = new ServiceApiGuard(jwt as any);
    const request = buildRequest({
      headers: { authorization: "Bearer valid-token" },
    });

    await expect(
      guard.canActivate(buildContext("userContext", request)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("lets a wildcard scope satisfy any endpoint", async () => {
    const jwt = {
      verifyAsync: jest.fn().mockResolvedValue({ sub: "svc", scope: "*" }),
    };
    const guard = new ServiceApiGuard(jwt as any);
    const request = buildRequest({
      headers: { authorization: "Bearer valid-token" },
    });

    await expect(
      guard.canActivate(buildContext("installation", request)),
    ).resolves.toBe(true);
  });

  it("accepts the x-service-api-key bypass outside production", async () => {
    process.env.KERNEL_SERVICE_API_KEY = "dev-secret";
    delete process.env.NODE_ENV;
    const guard = new ServiceApiGuard({} as any);
    const request = buildRequest({
      headers: { "x-service-api-key": "dev-secret" },
    });

    await expect(
      guard.canActivate(buildContext("userContext", request)),
    ).resolves.toBe(true);
  });

  it("never honors the x-service-api-key bypass in production, even with a matching key", async () => {
    process.env.KERNEL_SERVICE_API_KEY = "dev-secret";
    process.env.NODE_ENV = "production";
    const guard = new ServiceApiGuard({} as any);
    const request = buildRequest({
      headers: { "x-service-api-key": "dev-secret" },
    });

    await expect(
      guard.canActivate(buildContext("userContext", request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects requests with neither a token nor a matching api key", async () => {
    const guard = new ServiceApiGuard({} as any);
    const request = buildRequest();

    await expect(
      guard.canActivate(buildContext("userContext", request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
