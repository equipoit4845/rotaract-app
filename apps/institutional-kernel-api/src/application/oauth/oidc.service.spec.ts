import { BadRequestException, NotFoundException } from "@nestjs/common";

import type { SigningKeyService } from "../../infrastructure/crypto/signing-key.service";
import type { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { pkceS256, sha256 } from "../developer-apps/credentials";
import { OidcService } from "./oidc.service";
import { OAuthError } from "./oauth-error";

const VERIFIER = "v".repeat(43);
const CHALLENGE = pkceS256(VERIFIER);
const REDIRECT = "https://app.example/callback?tenant=1";

const app = {
  id: "app_1",
  clientId: "mra_1",
  name: "Agenda",
  description: null,
  type: "CONFIDENTIAL",
  status: "ACTIVE",
  organizationId: "club_1",
  grantTypes: ["authorization_code", "refresh_token"],
  scopes: ["openid", "profile", "email", "kernel.service.persons.read"],
  redirectUris: [REDIRECT],
  organization: { name: "Club Centro" },
} as any;

function setup(overrides: Record<string, any> = {}) {
  const prisma: any = {
    developerApp: {
      findUnique: jest.fn().mockResolvedValue(app),
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ organizationId: "club_1" }),
    },
    oAuthConsent: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    oAuthAuthorizationCode: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    oAuthRefreshToken: {
      create: jest.fn().mockResolvedValue({ id: "rt_new" }),
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    userAccount: {
      findUnique: jest.fn().mockResolvedValue({
        status: "ACTIVE",
        personId: "person_1",
        email: "ana@example.test",
        emailVerifiedAt: new Date(),
      }),
    },
    person: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        firstName: "Ana",
        lastName: "Pérez",
        displayName: null,
        avatarUrl: null,
      }),
    },
    organization: { findMany: jest.fn().mockResolvedValue([]) },
    organizationMembership: { findMany: jest.fn().mockResolvedValue([]) },
    appointment: { findMany: jest.fn().mockResolvedValue([]) },
    ...overrides,
  };
  prisma.$transaction = jest.fn((work: (tx: any) => unknown) => work(prisma));
  const keys = {
    sign: jest.fn(async (payload: object, options: object) =>
      JSON.stringify({ payload, options }),
    ),
  };
  return {
    oidc: new OidcService(
      prisma as PrismaService,
      keys as unknown as SigningKeyService,
    ),
    prisma,
    keys,
  };
}

const request = {
  clientId: "mra_1",
  redirectUri: REDIRECT,
  scope: "openid profile",
  responseType: "code",
  codeChallenge: CHALLENGE,
  codeChallengeMethod: "S256",
};

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected a rejection");
}

describe("OidcService — authorization request validation", () => {
  it.each([
    ["an unknown app", { developerApp: null }, {}, /no existe/],
    [
      "a suspended app",
      { developerApp: { ...app, status: "SUSPENDED" } },
      {},
      /no existe/,
    ],
    [
      "an app without authorization_code",
      { developerApp: { ...app, grantTypes: ["client_credentials"] } },
      {},
      /no existe/,
    ],
    [
      "an unregistered redirect_uri",
      {},
      { redirectUri: "https://app.example/callback" },
      /redirect_uri/,
    ],
    ["a response_type other than code", {}, { responseType: "token" }, /code/],
    ["the plain PKCE method", {}, { codeChallengeMethod: "plain" }, /S256/],
    ["a short code_challenge", {}, { codeChallenge: "abc" }, /43 y 128/],
    ["scopes without openid", {}, { scope: "profile" }, /openid/],
    [
      "a scope the app was not given",
      {},
      { scope: "openid memberships" },
      /memberships/,
    ],
    [
      "a service scope",
      {},
      { scope: "openid kernel.service.persons.read" },
      /kernel\.service/,
    ],
  ])("rejects %s with 400", async (_label, data, change, message) => {
    const { oidc, prisma } = setup();
    if ("developerApp" in data)
      prisma.developerApp.findUnique.mockResolvedValue(data.developerApp);
    const error = await rejection(
      oidc.authorizationContext("person_1", { ...request, ...change }),
    );
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toMatch(message);
  });

  it("reports the redirect_uri error before PKCE and scope errors", async () => {
    const { oidc } = setup();
    const error = await rejection(
      oidc.authorizationContext("person_1", {
        ...request,
        redirectUri: "https://evil.example/",
        codeChallengeMethod: "plain",
        scope: "profile",
      }),
    );
    expect((error as Error).message).toMatch(/redirect_uri/);
  });

  it("describes the app and the requested scopes", async () => {
    const { oidc } = setup();
    const context = await oidc.authorizationContext("person_1", request);
    expect(context).toEqual({
      app: {
        clientId: "mra_1",
        name: "Agenda",
        description: null,
        type: "CONFIDENTIAL",
        organizationName: "Club Centro",
      },
      scopes: [
        { scope: "openid", label: expect.any(String) },
        { scope: "profile", label: "Tu nombre y foto" },
      ],
      alreadyGranted: false,
    });
  });

  it.each([
    [{ scopes: ["openid", "profile", "email"], revokedAt: null }, true],
    [{ scopes: ["openid"], revokedAt: null }, false],
    [{ scopes: ["openid", "profile"], revokedAt: new Date() }, false],
  ])("alreadyGranted for consent %o is %s", async (consent, expected) => {
    const { oidc, prisma } = setup();
    prisma.oAuthConsent.findUnique.mockResolvedValue(consent);
    const context = await oidc.authorizationContext("person_1", request);
    expect(context.alreadyGranted).toBe(expected);
  });
});

describe("OidcService — authorize", () => {
  const user = { personId: "person_1", accountId: "acc_1" };

  it("denies by redirecting with access_denied and the state, keeping the query", async () => {
    const { oidc, prisma } = setup();
    const { redirectTo } = await oidc.authorize(user, {
      ...request,
      state: "xyz",
      decision: "deny",
    });
    const url = new URL(redirectTo);
    expect(url.searchParams.get("tenant")).toBe("1");
    expect(url.searchParams.get("error")).toBe("access_denied");
    expect(url.searchParams.get("state")).toBe("xyz");
    expect(prisma.oAuthAuthorizationCode.create).not.toHaveBeenCalled();
  });

  it("approves: merges the consent and stores only the code's hash", async () => {
    const { oidc, prisma } = setup();
    prisma.oAuthConsent.findUnique.mockResolvedValue({
      scopes: ["openid", "email"],
      revokedAt: null,
    });
    const { redirectTo } = await oidc.authorize(user, {
      ...request,
      state: "s1",
      nonce: "n1",
      decision: "approve",
    });
    const url = new URL(redirectTo);
    const code = url.searchParams.get("code")!;
    expect(code).toMatch(/^mrc_[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.get("state")).toBe("s1");
    expect(url.searchParams.get("tenant")).toBe("1");
    expect(prisma.oAuthConsent.upsert.mock.calls[0][0].update).toEqual({
      scopes: ["openid", "email", "profile"],
      revokedAt: null,
    });
    const stored = prisma.oAuthAuthorizationCode.create.mock.calls[0][0].data;
    expect(stored).toMatchObject({
      codeHash: sha256(code),
      appId: "app_1",
      personId: "person_1",
      accountId: "acc_1",
      scopes: ["openid", "profile"],
      codeChallenge: CHALLENGE,
      nonce: "n1",
    });
    expect(stored.expiresAt.getTime() - stored.authTime.getTime()).toBe(60_000);
  });

  it("does not bring back scopes from a revoked consent", async () => {
    const { oidc, prisma } = setup();
    prisma.oAuthConsent.findUnique.mockResolvedValue({
      scopes: ["openid", "email"],
      revokedAt: new Date(),
    });
    await oidc.authorize(user, { ...request, decision: "approve" });
    expect(prisma.oAuthConsent.upsert.mock.calls[0][0].update).toMatchObject({
      scopes: ["openid", "profile"],
      revokedAt: null,
      grantedAt: expect.any(Date),
    });
  });

  it("validates before deciding, so a bad redirect_uri never gets a redirect", async () => {
    const { oidc } = setup();
    await expect(
      oidc.authorize(user, {
        ...request,
        redirectUri: "https://evil.example/",
        decision: "deny",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("OidcService — code exchange", () => {
  const storedCode = () => ({
    id: "code_1",
    appId: "app_1",
    personId: "person_1",
    accountId: "acc_1",
    redirectUri: REDIRECT,
    scopes: ["openid", "profile"],
    codeChallenge: CHALLENGE,
    codeChallengeMethod: "S256",
    nonce: "n1",
    authTime: new Date("2026-10-02T12:00:00Z"),
    expiresAt: new Date(Date.now() + 30_000),
    consumedAt: null,
  });
  const params = {
    code: "mrc_x",
    redirectUri: REDIRECT,
    codeVerifier: VERIFIER,
  };

  function withCode(code: object | null) {
    const ctx = setup();
    ctx.prisma.oAuthAuthorizationCode.findUnique.mockResolvedValue(code);
    ctx.prisma.oAuthConsent.findUnique.mockResolvedValue({ revokedAt: null });
    return ctx;
  }

  it("issues access, ID and refresh tokens", async () => {
    const { oidc, prisma } = withCode(storedCode());
    const tokens = await oidc.exchangeCode(app, params);

    expect(prisma.oAuthAuthorizationCode.findUnique).toHaveBeenCalledWith({
      where: { codeHash: sha256("mrc_x") },
    });
    expect(prisma.oAuthAuthorizationCode.updateMany).toHaveBeenCalledWith({
      where: { id: "code_1", consumedAt: null },
      data: { consumedAt: expect.any(Date) },
    });
    expect(tokens).toMatchObject({
      token_type: "Bearer",
      expires_in: 600,
      scope: "openid profile",
      refresh_token: expect.stringMatching(/^mrr_[A-Za-z0-9_-]{64}$/),
    });
    const access = JSON.parse(tokens.access_token);
    expect(access).toEqual({
      payload: {
        client_id: "mra_1",
        azp: "mra_1",
        token_use: "user",
        scope: "openid profile",
      },
      options: {
        audience: "institutional-kernel",
        subject: "person_1",
        expiresIn: 600,
      },
    });
    const id = JSON.parse(tokens.id_token!);
    expect(id.options).toEqual({
      audience: "mra_1",
      subject: "person_1",
      expiresIn: 600,
    });
    expect(id.payload).toEqual({
      azp: "mra_1",
      nonce: "n1",
      auth_time: Date.parse("2026-10-02T12:00:00Z") / 1000,
      name: "Ana Pérez",
      given_name: "Ana",
      family_name: "Pérez",
      picture: null,
    });
    expect(prisma.oAuthRefreshToken.create.mock.calls[0][0].data).toMatchObject(
      {
        tokenHash: sha256(tokens.refresh_token!),
        scopes: ["openid", "profile"],
      },
    );
  });

  it("omits the refresh token when the app lacks the grant", async () => {
    const { oidc } = withCode(storedCode());
    const tokens = await oidc.exchangeCode(
      { ...app, grantTypes: ["authorization_code"] },
      params,
    );
    expect(tokens.refresh_token).toBeUndefined();
  });

  it.each([
    ["an unknown code", null, {}],
    ["another app's code", { ...storedCode(), appId: "app_2" }, {}],
    [
      "an expired code",
      { ...storedCode(), expiresAt: new Date(Date.now() - 1) },
      {},
    ],
    [
      "another redirect_uri",
      storedCode(),
      { redirectUri: "https://x.example" },
    ],
    ["a wrong code_verifier", storedCode(), { codeVerifier: "w".repeat(43) }],
    ["a short code_verifier", storedCode(), { codeVerifier: "short" }],
  ])("rejects %s as invalid_grant", async (_label, code, change) => {
    const { oidc } = withCode(code);
    const error = await rejection(
      oidc.exchangeCode(app, { ...params, ...change }),
    );
    expect(error).toBeInstanceOf(OAuthError);
    expect((error as OAuthError).error).toBe("invalid_grant");
  });

  it("rejects a reused code (already consumed)", async () => {
    const { oidc, prisma } = withCode(storedCode());
    prisma.oAuthAuthorizationCode.updateMany.mockResolvedValue({ count: 0 });
    await expect(oidc.exchangeCode(app, params)).rejects.toMatchObject({
      error: "invalid_grant",
    });
  });

  it("never consumes another app's code", async () => {
    const { oidc, prisma } = withCode({ ...storedCode(), appId: "app_2" });
    await rejection(oidc.exchangeCode(app, params));
    expect(prisma.oAuthAuthorizationCode.updateMany).not.toHaveBeenCalled();
  });

  it("rejects when the account is no longer active", async () => {
    const { oidc, prisma } = withCode(storedCode());
    prisma.userAccount.findUnique.mockResolvedValue({
      status: "SUSPENDED",
      personId: "person_1",
    });
    await expect(oidc.exchangeCode(app, params)).rejects.toMatchObject({
      error: "invalid_grant",
    });
  });

  it("asks for the missing parameters with invalid_request", async () => {
    const { oidc } = withCode(storedCode());
    await expect(
      oidc.exchangeCode(app, { code: "mrc_x" }),
    ).rejects.toMatchObject({ error: "invalid_request" });
  });
});

describe("OidcService — refresh rotation and reuse", () => {
  const token = (change: object = {}) => ({
    id: "rt_1",
    appId: "app_1",
    personId: "person_1",
    accountId: "acc_1",
    scopes: ["openid", "profile"],
    authTime: new Date("2026-10-02T12:00:00Z"),
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    replacedById: null,
    ...change,
  });

  function withToken(row: object | null) {
    const ctx = setup();
    ctx.prisma.oAuthRefreshToken.findUnique.mockResolvedValue(row);
    ctx.prisma.oAuthConsent.findUnique.mockResolvedValue({ revokedAt: null });
    return ctx;
  }

  it("rotates: new token, old one revoked and linked to it", async () => {
    const { oidc, prisma } = withToken(token());
    const tokens = await oidc.refresh(app, { refreshToken: "mrr_old" });

    expect(tokens.refresh_token).toMatch(/^mrr_/);
    expect(tokens.refresh_token).not.toBe("mrr_old");
    expect(prisma.oAuthRefreshToken.updateMany).toHaveBeenCalledWith({
      where: { id: "rt_1", revokedAt: null },
      data: { revokedAt: expect.any(Date), replacedById: "rt_new" },
    });
    const id = JSON.parse(tokens.id_token!);
    expect(id.payload).not.toHaveProperty("nonce");
    expect(id.payload.auth_time).toBe(
      Date.parse("2026-10-02T12:00:00Z") / 1000,
    );
  });

  it("narrows the access token scope but keeps the refresh token's", async () => {
    const { oidc, prisma } = withToken(token());
    const tokens = await oidc.refresh(app, {
      refreshToken: "mrr_old",
      scope: "openid",
    });
    expect(tokens.scope).toBe("openid");
    expect(
      prisma.oAuthRefreshToken.create.mock.calls[0][0].data.scopes,
    ).toEqual(["openid", "profile"]);
  });

  it("rejects a wider scope with invalid_scope", async () => {
    const { oidc } = withToken(token());
    await expect(
      oidc.refresh(app, { refreshToken: "mrr_old", scope: "openid email" }),
    ).rejects.toMatchObject({ error: "invalid_scope" });
  });

  it("detects reuse of a rotated token and revokes the whole family", async () => {
    const { oidc, prisma } = withToken(
      token({ revokedAt: new Date(), replacedById: "rt_2" }),
    );
    await expect(
      oidc.refresh(app, { refreshToken: "mrr_old" }),
    ).rejects.toMatchObject({ error: "invalid_grant" });
    expect(prisma.oAuthRefreshToken.updateMany).toHaveBeenCalledWith({
      where: { personId: "person_1", appId: "app_1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("treats a concurrent rotation as reuse", async () => {
    const { oidc, prisma } = withToken(token());
    prisma.oAuthRefreshToken.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    await expect(
      oidc.refresh(app, { refreshToken: "mrr_old" }),
    ).rejects.toMatchObject({ error: "invalid_grant" });
    expect(prisma.oAuthRefreshToken.updateMany).toHaveBeenLastCalledWith({
      where: { personId: "person_1", appId: "app_1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it.each([
    ["an unknown token", null],
    ["another app's token", token({ appId: "app_2" })],
    ["an expired token", token({ expiresAt: new Date(Date.now() - 1) })],
    ["a token revoked without rotation", token({ revokedAt: new Date() })],
  ])("rejects %s as invalid_grant", async (_label, row) => {
    const { oidc, prisma } = withToken(row);
    await expect(
      oidc.refresh(app, { refreshToken: "mrr_old" }),
    ).rejects.toMatchObject({ error: "invalid_grant" });
    expect(prisma.oAuthRefreshToken.updateMany).not.toHaveBeenCalled();
  });

  it("requires a consent still in force", async () => {
    const { oidc, prisma } = withToken(token());
    prisma.oAuthConsent.findUnique.mockResolvedValue({ revokedAt: new Date() });
    await expect(
      oidc.refresh(app, { refreshToken: "mrr_old" }),
    ).rejects.toMatchObject({ error: "invalid_grant" });
  });
});

describe("OidcService — revoke, userinfo and consents", () => {
  it("revokes only the authenticated app's refresh token", async () => {
    const { oidc, prisma } = setup();
    await oidc.revoke(app, "mrr_x");
    expect(prisma.oAuthRefreshToken.updateMany).toHaveBeenCalledWith({
      where: { tokenHash: sha256("mrr_x"), appId: "app_1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("restricts userinfo memberships to the app's organization tree", async () => {
    const { oidc, prisma } = setup();
    prisma.organization.findMany
      .mockResolvedValueOnce([{ id: "sub_1" }])
      .mockResolvedValueOnce([]);
    prisma.organizationMembership.findMany.mockResolvedValue([
      {
        status: "ACTIVE",
        organization: { id: "club_1", name: "Club Centro", type: "CLUB" },
      },
    ]);
    const scopes = ["openid", "memberships"];
    const info = await oidc.userInfo({
      personId: "person_1",
      scopes,
      appId: "app_1",
    });

    expect(info).toEqual({
      sub: "person_1",
      memberships: [
        {
          organizationId: "club_1",
          organizationName: "Club Centro",
          organizationType: "CLUB",
          status: "ACTIVE",
        },
      ],
    });
    expect(prisma.organizationMembership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          personId: "person_1",
          organizationId: { in: ["club_1", "sub_1"] },
          status: { in: ["ACTIVE", "ON_LEAVE"] },
        },
      }),
    );
  });

  it("revokes a consent together with its refresh tokens", async () => {
    const { oidc, prisma } = setup();
    await oidc.revokeConsent("person_1", "app_1");
    expect(prisma.oAuthConsent.updateMany).toHaveBeenCalledWith({
      where: { personId: "person_1", appId: "app_1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.oAuthRefreshToken.updateMany).toHaveBeenCalledWith({
      where: { personId: "person_1", appId: "app_1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("answers 404 for a consent that was not in force", async () => {
    const { oidc, prisma } = setup();
    prisma.oAuthConsent.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      oidc.revokeConsent("person_1", "app_1"),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.oAuthRefreshToken.updateMany).not.toHaveBeenCalled();
  });

  it("lists consents with scope labels", async () => {
    const { oidc, prisma } = setup();
    const grantedAt = new Date();
    prisma.oAuthConsent.findMany.mockResolvedValue([
      {
        scopes: ["openid", "email"],
        grantedAt,
        app: {
          id: "app_1",
          clientId: "mra_1",
          name: "Agenda",
          organization: { name: "Club Centro" },
        },
      },
    ]);
    expect(await oidc.listConsents("person_1")).toEqual([
      {
        appId: "app_1",
        clientId: "mra_1",
        appName: "Agenda",
        organizationName: "Club Centro",
        scopes: [
          { scope: "openid", label: expect.any(String) },
          { scope: "email", label: "Tu correo electrónico" },
        ],
        grantedAt,
      },
    ]);
  });
});
