import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";

import type { CommandContext } from "../../domain/shared/command-context";
import { verifyClientSecret } from "./credentials";
import {
  canTransition,
  DeveloperAppsService,
  isValidRedirectUri,
  SECRET_ROTATION_GRACE_MS,
  validateDeveloperAppSettings,
} from "./developer-apps.service";

const context: CommandContext = {
  commandId: "cmd",
  actor: { type: "USER", id: "person_rdr" },
  idempotencyKey: "k1",
};

const confidential = {
  name: "Asistencia",
  description: "Toma asistencia en reuniones",
  type: "CONFIDENTIAL",
  grantTypes: ["client_credentials"],
  scopes: ["kernel.service.organizations.read"],
};

const oidc = {
  name: "Portal",
  type: "PUBLIC",
  grantTypes: ["authorization_code", "refresh_token"],
  scopes: ["openid", "profile"],
  redirectUris: ["https://portal.example.org/callback"],
};

function rejects(input: object, message: RegExp) {
  expect(() => validateDeveloperAppSettings(input as any)).toThrow(message);
  try {
    validateDeveloperAppSettings(input as any);
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
  }
}

describe("validateDeveloperAppSettings", () => {
  it("accepts a confidential service app and a public login app", () => {
    expect(validateDeveloperAppSettings(confidential)).toMatchObject({
      name: "Asistencia",
      type: "CONFIDENTIAL",
      redirectUris: [],
    });
    expect(validateDeveloperAppSettings(oidc)).toMatchObject({
      type: "PUBLIC",
      description: null,
    });
  });

  it("accepts a confidential app that combines both", () => {
    expect(() =>
      validateDeveloperAppSettings({
        ...oidc,
        type: "CONFIDENTIAL",
        grantTypes: ["client_credentials", "authorization_code"],
        scopes: ["openid", "kernel.service.persons.read"],
      }),
    ).not.toThrow();
  });

  it.each([
    ["a", /entre 2 y 80/],
    ["x".repeat(81), /entre 2 y 80/],
    [undefined, /nombre es obligatorio/],
  ])("validates the name %p", (name, message) => {
    rejects({ ...confidential, name }, message);
  });

  it("limits the description to 500 characters", () => {
    rejects({ ...confidential, description: "x".repeat(501) }, /hasta 500/);
    expect(
      validateDeveloperAppSettings({
        ...confidential,
        description: "x".repeat(500),
      }).description,
    ).toHaveLength(500);
  });

  it("rejects an unknown type, grant or scope", () => {
    rejects({ ...confidential, type: "SERVER" }, /CONFIDENTIAL o PUBLIC/);
    rejects({ ...confidential, grantTypes: ["password"] }, /desconocido/);
    rejects({ ...confidential, grantTypes: [] }, /al menos un tipo/);
    rejects({ ...confidential, scopes: ["kernel.admin"] }, /desconocido/);
    rejects({ ...confidential, scopes: [] }, /al menos un dato/);
  });

  it("requires client_credentials for service scopes", () => {
    rejects(
      {
        ...oidc,
        type: "CONFIDENTIAL",
        scopes: ["openid", "kernel.service.persons.read"],
      },
      /requieren el acceso client_credentials/,
    );
  });

  it("only lets CONFIDENTIAL apps use client_credentials", () => {
    rejects({ ...confidential, type: "PUBLIC" }, /Solo una app de servidor/);
  });

  it("requires openid and a redirect URI for authorization_code", () => {
    rejects({ ...oidc, scopes: ["profile"] }, /requiere el permiso openid/);
    rejects({ ...oidc, redirectUris: [] }, /al menos una URL de retorno/);
  });

  it("requires authorization_code for refresh_token", () => {
    rejects(
      { ...confidential, grantTypes: ["client_credentials", "refresh_token"] },
      /refresh_token solo se puede usar/,
    );
  });

  it("rejects invalid redirect URIs", () => {
    rejects(
      { ...oidc, redirectUris: ["http://portal.example.org/cb"] },
      /no es válida/,
    );
  });
});

describe("isValidRedirectUri", () => {
  it.each([
    "https://portal.example.org/callback",
    "https://portal.example.org/callback?x=1",
    "http://localhost:5173/callback",
    "http://127.0.0.1:8080/cb",
    "http://localhost/cb",
  ])("accepts %s", (uri) => expect(isValidRedirectUri(uri)).toBe(true));

  it.each([
    "http://portal.example.org/callback",
    "https://portal.example.org/callback#frag",
    "/callback",
    "portal.example.org/callback",
    "javascript:alert(1)",
    "myapp://callback",
    "http://localhost.evil.com/cb",
  ])("rejects %s", (uri) => expect(isValidRedirectUri(uri)).toBe(false));
});

describe("canTransition", () => {
  it.each([
    ["ACTIVE", "SUSPENDED", true],
    ["SUSPENDED", "ACTIVE", true],
    ["ACTIVE", "REVOKED", true],
    ["SUSPENDED", "REVOKED", true],
    ["ACTIVE", "ACTIVE", false],
    ["SUSPENDED", "SUSPENDED", false],
    ["REVOKED", "ACTIVE", false],
    ["REVOKED", "SUSPENDED", false],
    ["REVOKED", "REVOKED", false],
  ])("%s -> %s = %p", (from, to, expected) => {
    expect(canTransition(from as any, to as any)).toBe(expected);
  });
});

function service(state: { app?: any; secrets?: any[]; org?: any } = {}) {
  const tx: any = {
    organization: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          state.org === undefined ? { status: "ACTIVE" } : state.org,
        ),
    },
    developerApp: {
      findUnique: jest.fn().mockResolvedValue(state.app ?? null),
      create: jest.fn(async ({ data }: any) => ({
        id: "app_1",
        ...data,
        secrets: data.secrets
          ? [{ id: "sec_new", hint: data.secrets.create.hint }]
          : [],
        _secretData: data.secrets?.create,
      })),
      update: jest.fn(async ({ data }: any) => ({ ...state.app, ...data })),
    },
    developerAppSecret: {
      findMany: jest.fn().mockResolvedValue(state.secrets ?? []),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
      create: jest.fn(async ({ data }: any) => ({
        id: "sec_new",
        createdAt: new Date(),
        ...data,
      })),
    },
    oAuthRefreshToken: { updateMany: jest.fn() },
    oAuthConsent: { updateMany: jest.fn() },
  };
  const commands = {
    execute: jest.fn(
      (_op: string, _ctx: unknown, _req: unknown, handler: any) => handler(tx),
    ),
  };
  const audit = { record: jest.fn() };
  return {
    apps: new DeveloperAppsService(
      { developerApp: tx.developerApp } as any,
      commands as any,
      audit as any,
    ),
    tx,
    commands,
    audit,
  };
}

const storedApp = (overrides: object = {}) => ({
  id: "app_1",
  clientId: "mra_1",
  name: "Asistencia",
  description: null,
  type: "CONFIDENTIAL",
  status: "ACTIVE",
  organizationId: "club_1",
  ownerPersonId: "person_rdr",
  grantTypes: ["client_credentials"],
  scopes: ["kernel.service.organizations.read"],
  redirectUris: [],
  secrets: [],
  ...overrides,
});

describe("DeveloperAppsService.create", () => {
  it("returns the secret once, stores only its hash, and owns the app by the actor", async () => {
    const { apps, tx, audit } = service();

    const result = await apps.create(
      {
        ...confidential,
        organizationId: "club_1",
        ownerPersonId: "someone_else",
        status: "SUSPENDED",
      },
      context,
    );

    expect(result.clientSecret).toMatch(/^mrs_[A-Za-z0-9_-]{43}$/);
    const data = tx.developerApp.create.mock.calls[0][0].data;
    expect(data.ownerPersonId).toBe("person_rdr");
    expect(data.status).toBeUndefined();
    expect(data.clientId).toMatch(/^mra_[0-9a-f]{20}$/);
    expect(data.secrets.create.hint).toBe(result.clientSecret!.slice(-4));
    expect(data.secrets.create.secretHash).not.toContain(result.clientSecret);
    await expect(
      verifyClientSecret(data.secrets.create.secretHash, result.clientSecret!),
    ).resolves.toBe(true);
    expect(JSON.stringify(result.app)).not.toContain(result.clientSecret);
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      context,
      "createDeveloperApp",
      "DeveloperApp",
      "app_1",
      "club_1",
    );
  });

  it("gives a PUBLIC app no secret", async () => {
    const { apps, tx } = service();
    const result = await apps.create(
      { ...oidc, organizationId: "club_1" },
      context,
    );
    expect(result.clientSecret).toBeNull();
    expect(
      tx.developerApp.create.mock.calls[0][0].data.secrets,
    ).toBeUndefined();
  });

  it("does not hand the secret out again on an idempotent replay", async () => {
    const { apps, commands } = service();
    commands.execute.mockResolvedValueOnce({
      app: storedApp(),
      clientSecret: null,
    });
    const result = await apps.create(
      { ...confidential, organizationId: "club_1" },
      context,
    );
    expect(result.clientSecret).toBeNull();
  });

  it.each([
    [null, /no existe/],
    [{ status: "INACTIVE" }, /no está activa/],
  ])("requires an existing ACTIVE organization (%p)", async (org, message) => {
    const { apps } = service({ org });
    await expect(
      apps.create({ ...confidential, organizationId: "club_1" }, context),
    ).rejects.toThrow(message);
  });

  it("requires an authenticated person", async () => {
    const { apps } = service();
    await expect(
      apps.create(
        { ...confidential, organizationId: "club_1" },
        { commandId: "c", actor: { type: "SYSTEM" } },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("DeveloperAppsService.update", () => {
  it("keeps type and grants, re-validates the result", async () => {
    const { apps } = service({ app: storedApp() });
    await expect(
      apps.update(
        "app_1",
        { scopes: ["openid"], grantTypes: ["authorization_code"] },
        context,
      ),
    ).resolves.toMatchObject({ scopes: ["openid"] });
    // grantTypes is not editable, so openid stays without authorization_code
    // and service scopes still need client_credentials:
    const { apps: publicApps } = service({
      app: storedApp({
        type: "PUBLIC",
        grantTypes: ["authorization_code"],
        scopes: ["openid"],
        redirectUris: ["https://a.example.org/cb"],
      }),
    });
    await expect(
      publicApps.update(
        "app_1",
        { scopes: ["openid", "kernel.service.persons.read"] },
        context,
      ),
    ).rejects.toThrow(/client_credentials/);
  });

  it("404s an unknown app and 409s a revoked one", async () => {
    await expect(
      service().apps.update("nope", { name: "Otra" }, context),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service({ app: storedApp({ status: "REVOKED" }) }).apps.update(
        "app_1",
        { name: "Otra" },
        context,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe("DeveloperAppsService.rotateSecret", () => {
  const day = 24 * 60 * 60 * 1_000;

  it("gives the current secret a 7-day grace period", async () => {
    const { apps, tx } = service({
      app: storedApp(),
      secrets: [{ id: "old", createdAt: new Date(), expiresAt: null }],
    });
    const before = Date.now();

    const result = await apps.rotateSecret("app_1", context);

    expect(result.secret).toMatch(/^mrs_/);
    expect(result.hint).toBe(result.secret.slice(-4));
    expect(tx.developerAppSecret.updateMany).not.toHaveBeenCalled();
    const [[call]] = tx.developerAppSecret.update.mock.calls;
    expect(call.where).toEqual({ id: "old" });
    const expiresAt = call.data.expiresAt.getTime();
    expect(expiresAt).toBeGreaterThanOrEqual(before + SECRET_ROTATION_GRACE_MS);
    expect(expiresAt).toBeLessThanOrEqual(
      Date.now() + SECRET_ROTATION_GRACE_MS,
    );
  });

  it("keeps an earlier expiry", async () => {
    const { apps, tx } = service({
      app: storedApp(),
      secrets: [
        {
          id: "old",
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + day),
        },
      ],
    });
    await apps.rotateSecret("app_1", context);
    expect(tx.developerAppSecret.update).not.toHaveBeenCalled();
  });

  it("revokes the oldest at once when two are already current", async () => {
    const { apps, tx } = service({
      app: storedApp(),
      secrets: [
        {
          id: "oldest",
          createdAt: new Date(1),
          expiresAt: new Date(Date.now() + day),
        },
        { id: "newer", createdAt: new Date(2), expiresAt: null },
      ],
    });
    await apps.rotateSecret("app_1", context);
    expect(tx.developerAppSecret.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["oldest"] } },
      data: { revokedAt: expect.any(Date) },
    });
    expect(tx.developerAppSecret.update).toHaveBeenCalledTimes(1);
    expect(tx.developerAppSecret.update.mock.calls[0][0].where).toEqual({
      id: "newer",
    });
  });

  it("409s for PUBLIC or REVOKED apps", async () => {
    await expect(
      service({ app: storedApp({ type: "PUBLIC" }) }).apps.rotateSecret(
        "app_1",
        context,
      ),
    ).rejects.toThrow(/PUBLIC no tiene secretos/);
    await expect(
      service({ app: storedApp({ status: "REVOKED" }) }).apps.rotateSecret(
        "app_1",
        context,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("refuses to replay a secret that was already delivered", async () => {
    const { apps, commands } = service({ app: storedApp() });
    commands.execute.mockResolvedValueOnce({
      secretId: "sec_previous",
      hint: "abcd",
      createdAt: new Date(),
    });
    await expect(apps.rotateSecret("app_1", context)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe("DeveloperAppsService.revokeSecret", () => {
  it("404s a secret of another app", async () => {
    const { apps, tx } = service({ app: storedApp() });
    tx.developerAppSecret.findFirst.mockResolvedValue(null);
    await expect(
      apps.revokeSecret("app_1", "sec_x", context),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.developerAppSecret.findFirst).toHaveBeenCalledWith({
      where: { id: "sec_x", appId: "app_1" },
    });
  });

  it("marks the secret revoked", async () => {
    const { apps, tx } = service({ app: storedApp() });
    tx.developerAppSecret.findFirst.mockResolvedValue({ id: "sec_1" });
    await apps.revokeSecret("app_1", "sec_1", context);
    expect(tx.developerAppSecret.update).toHaveBeenCalledWith({
      where: { id: "sec_1" },
      data: { revokedAt: expect.any(Date) },
    });
  });
});

describe("DeveloperAppsService.transition", () => {
  it("suspends and reactivates", async () => {
    const { apps, tx } = service({ app: storedApp() });
    await apps.transition("app_1", "SUSPENDED", context);
    expect(tx.developerApp.update.mock.calls[0][0].data).toEqual({
      status: "SUSPENDED",
      suspendedAt: expect.any(Date),
    });
    const suspended = service({ app: storedApp({ status: "SUSPENDED" }) });
    await suspended.apps.transition("app_1", "ACTIVE", context);
    expect(suspended.tx.developerApp.update.mock.calls[0][0].data).toEqual({
      status: "ACTIVE",
      suspendedAt: null,
    });
  });

  it("revoking invalidates secrets, refresh tokens and consents", async () => {
    const { apps, tx, audit } = service({ app: storedApp() });
    await apps.transition("app_1", "REVOKED", context);
    for (const model of [
      tx.developerAppSecret,
      tx.oAuthRefreshToken,
      tx.oAuthConsent,
    ])
      expect(model.updateMany).toHaveBeenCalledWith({
        where: { appId: "app_1", revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      context,
      "revokeDeveloperApp",
      "DeveloperApp",
      "app_1",
      "club_1",
    );
  });

  it("409s an invalid transition", async () => {
    await expect(
      service({ app: storedApp({ status: "REVOKED" }) }).apps.transition(
        "app_1",
        "ACTIVE",
        context,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service({ app: storedApp() }).apps.transition("app_1", "ACTIVE", context),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
