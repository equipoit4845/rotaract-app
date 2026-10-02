import type { ExecutionContext } from "@nestjs/common";

import type { SigningKeyService } from "../../infrastructure/crypto/signing-key.service";
import type { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { OidcAccessGuard } from "./oidc-access.guard";
import { OAuthError } from "./oauth-error";

const validPayload = {
  sub: "person_1",
  client_id: "mra_1",
  token_use: "user",
  scope: "openid profile email",
};

function setup(
  options: {
    payload?: object | Error;
    app?: object | null;
    consent?: object | null;
    account?: object | null;
    authorization?: string;
  } = {},
) {
  const keys = {
    verify: jest.fn(async () => {
      const payload = options.payload ?? validPayload;
      if (payload instanceof Error) throw payload;
      return payload;
    }),
  };
  const prisma = {
    developerApp: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          "app" in options ? options.app : { id: "app_1", status: "ACTIVE" },
        ),
    },
    oAuthConsent: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          "consent" in options
            ? options.consent
            : { revokedAt: null, scopes: ["openid", "profile"] },
        ),
    },
    userAccount: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          "account" in options ? options.account : { status: "ACTIVE" },
        ),
    },
  };
  const request: any = {
    headers: {
      authorization:
        "authorization" in options ? options.authorization : "Bearer jwt",
    },
  };
  const response: any = {
    headers: {} as Record<string, string>,
    statusCode: 200,
    body: undefined as unknown,
  };
  response.setHeader = jest.fn((name: string, value: string) => {
    response.headers[name] = value;
    return response;
  });
  response.status = jest.fn((code: number) => {
    response.statusCode = code;
    return response;
  });
  response.json = jest.fn((body: unknown) => {
    response.body = body;
    return response;
  });
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
  const guard = new OidcAccessGuard(
    keys as unknown as SigningKeyService,
    prisma as unknown as PrismaService,
  );
  return { guard, context, request, response, keys };
}

describe("OidcAccessGuard", () => {
  it("accepts a user access token and limits scopes to the consent", async () => {
    const { guard, context, request, keys } = setup();
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(keys.verify).toHaveBeenCalledWith("jwt", {
      audience: "institutional-kernel",
    });
    expect(request.oidc).toEqual({
      personId: "person_1",
      appId: "app_1",
      clientId: "mra_1",
      scopes: ["openid", "profile"],
    });
  });

  it.each([
    ["no bearer token", { authorization: undefined }],
    ["a bad signature or expired token", { payload: new Error("bad") }],
    ["a service token", { payload: { ...validPayload, token_use: "service" } }],
    ["an unknown app", { app: null }],
    ["a suspended app", { app: { id: "app_1", status: "SUSPENDED" } }],
    ["no consent", { consent: null }],
    [
      "a revoked consent",
      { consent: { revokedAt: new Date(), scopes: ["openid"] } },
    ],
    ["an inactive account", { account: { status: "SUSPENDED" } }],
  ])("answers 401 invalid_token for %s", async (_label, options) => {
    const { guard, context } = setup(options);
    // ProblemFilter renders it as 401 { error: "invalid_token" } with
    // WWW-Authenticate (asserted end to end in test/oidc.e2e-spec.ts).
    const error = await guard.canActivate(context).catch((e) => e);
    expect(error).toBeInstanceOf(OAuthError);
    expect(error.error).toBe("invalid_token");
    expect(error.status).toBe(401);
  });
});
