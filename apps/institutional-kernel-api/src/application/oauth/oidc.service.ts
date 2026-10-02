import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import {
  AccountStatus,
  DeveloperAppStatus,
  type DeveloperApp,
  type Organization,
} from "@prisma/client";

import { SigningKeyService } from "../../infrastructure/crypto/signing-key.service";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import {
  newOpaqueToken,
  pkceS256,
  sha256,
} from "../developer-apps/credentials";
import { buildClaims } from "./claims";
import type { TokenResponse } from "./client-credentials.grant";
import { boundAccessApp } from "./oidc-access-context";
import { OAuthError } from "./oauth-error";
import {
  KERNEL_AUDIENCE,
  TOKEN_TTL,
  isOidcScope,
  parseScope,
  scopeLabel,
} from "./scopes";

export type AuthorizationRequest = {
  clientId: string;
  redirectUri: string;
  scope: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  responseType?: string;
  state?: string | null;
  nonce?: string | null;
};

/** RFC 7636 §4.1/4.2: 43–128 unreserved characters; S256 output is base64url. */
const CODE_CHALLENGE = /^[A-Za-z0-9_-]{43,128}$/;
const CODE_VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;

type ValidatedRequest = {
  app: DeveloperApp & { organization: Pick<Organization, "name"> };
  scopes: string[];
};

type Grant = {
  personId: string;
  accountId: string;
  scopes: string[];
  authTime: Date;
  nonce?: string | null;
};

/** Internal signal: the refresh token was rotated concurrently (reuse). */
class RefreshReuseDetected extends Error {}

const isSubset = (subset: string[], of: string[]) =>
  subset.every((scope) => of.includes(scope));

/**
 * E3 — "Ingresar con Mi Rotaract": authorization code + PKCE, refresh
 * tokens, userinfo and consents. See docs/11-developer-platform-auth.md §E3.
 */
@Injectable()
export class OidcService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly keys: SigningKeyService,
  ) {}

  async authorizationContext(
    personId: string,
    request: AuthorizationRequest,
  ): Promise<{
    app: {
      clientId: string;
      name: string;
      description: string | null;
      type: "CONFIDENTIAL" | "PUBLIC";
      organizationName: string;
    };
    scopes: Array<{ scope: string; label: string }>;
    alreadyGranted: boolean;
  }> {
    const { app, scopes } = await this.validate(request, {
      checkResponseType: true,
    });
    const consent = await this.prisma.oAuthConsent.findUnique({
      where: { personId_appId: { personId, appId: app.id } },
    });
    return {
      app: {
        clientId: app.clientId,
        name: app.name,
        description: app.description,
        type: app.type,
        organizationName: app.organization.name,
      },
      scopes: scopes.map((scope) => ({ scope, label: scopeLabel(scope) })),
      alreadyGranted:
        !!consent && !consent.revokedAt && isSubset(scopes, consent.scopes),
    };
  }

  async authorize(
    user: { personId: string; accountId: string },
    request: AuthorizationRequest & { decision: "approve" | "deny" },
  ): Promise<{ redirectTo: string }> {
    const { app, scopes } = await this.validate(request, {
      checkResponseType: false,
    });
    const redirect = new URL(request.redirectUri);
    const withState = () => {
      if (request.state) redirect.searchParams.set("state", request.state);
      return { redirectTo: redirect.toString() };
    };

    if (request.decision !== "approve") {
      redirect.searchParams.set("error", "access_denied");
      return withState();
    }

    const now = new Date();
    const { token: code, hash } = newOpaqueToken("mrc_", 32);
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.oAuthConsent.findUnique({
        where: { personId_appId: { personId: user.personId, appId: app.id } },
      });
      // A revoked consent starts over: re-approving must not silently bring
      // back scopes the person took away.
      const previous = existing && !existing.revokedAt ? existing.scopes : [];
      const union = [...new Set([...previous, ...scopes])];
      await tx.oAuthConsent.upsert({
        where: { personId_appId: { personId: user.personId, appId: app.id } },
        create: { personId: user.personId, appId: app.id, scopes: union },
        update: {
          scopes: union,
          revokedAt: null,
          ...(existing?.revokedAt ? { grantedAt: now } : {}),
        },
      });
      await tx.oAuthAuthorizationCode.create({
        data: {
          codeHash: hash,
          appId: app.id,
          personId: user.personId,
          accountId: user.accountId,
          redirectUri: request.redirectUri,
          scopes,
          codeChallenge: request.codeChallenge,
          codeChallengeMethod: "S256",
          nonce: request.nonce || null,
          authTime: now,
          expiresAt: new Date(
            now.getTime() + TOKEN_TTL.authorizationCode * 1_000,
          ),
        },
      });
    });
    redirect.searchParams.set("code", code);
    return withState();
  }

  /** grant_type=authorization_code (throws OAuthError on failure). */
  async exchangeCode(
    app: DeveloperApp,
    params: { code?: string; redirectUri?: string; codeVerifier?: string },
  ): Promise<TokenResponse> {
    if (!params.code || !params.redirectUri || !params.codeVerifier)
      throw new OAuthError(
        "invalid_request",
        "code, redirect_uri and code_verifier are required",
      );
    const invalid = () =>
      new OAuthError("invalid_grant", "Invalid authorization code");
    if (!CODE_VERIFIER.test(params.codeVerifier))
      throw new OAuthError("invalid_grant", "Malformed code_verifier");

    const code = await this.prisma.oAuthAuthorizationCode.findUnique({
      where: { codeHash: sha256(params.code) },
    });
    // Another app's code is rejected without consuming it, so a client
    // can't burn codes it does not own.
    if (!code || code.appId !== app.id) throw invalid();
    const consumed = await this.prisma.oAuthAuthorizationCode.updateMany({
      where: { id: code.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) throw invalid();
    if (
      code.expiresAt <= new Date() ||
      code.redirectUri !== params.redirectUri ||
      code.codeChallengeMethod !== "S256" ||
      pkceS256(params.codeVerifier) !== code.codeChallenge
    )
      throw invalid();

    await this.assertAccountActive(code.accountId, code.personId);
    await this.assertConsent(code.personId, app.id);
    return this.issueTokens(app, {
      personId: code.personId,
      accountId: code.accountId,
      scopes: code.scopes,
      authTime: code.authTime,
      nonce: code.nonce,
    });
  }

  /** grant_type=refresh_token, with rotation and reuse detection. */
  async refresh(
    app: DeveloperApp,
    params: { refreshToken?: string; scope?: string },
  ): Promise<TokenResponse> {
    if (!params.refreshToken)
      throw new OAuthError("invalid_request", "refresh_token is required");
    const invalid = () =>
      new OAuthError("invalid_grant", "Invalid refresh token");
    const current = await this.prisma.oAuthRefreshToken.findUnique({
      where: { tokenHash: sha256(params.refreshToken) },
    });
    if (!current || current.appId !== app.id) throw invalid();
    if (current.revokedAt) {
      // A rotated token presented again means it leaked: kill the family.
      if (current.replacedById)
        await this.revokeRefreshTokens(current.personId, app.id);
      throw invalid();
    }
    if (current.expiresAt <= new Date()) throw invalid();

    const requested =
      params.scope === undefined || params.scope === ""
        ? current.scopes
        : parseScope(params.scope);
    if (!isSubset(requested, current.scopes))
      throw new OAuthError(
        "invalid_scope",
        "scope must be a subset of the original grant",
      );
    await this.assertConsent(current.personId, app.id);
    await this.assertAccountActive(current.accountId, current.personId);

    const now = new Date();
    const next = newOpaqueToken("mrr_", 48);
    try {
      await this.prisma.$transaction(async (tx) => {
        const created = await tx.oAuthRefreshToken.create({
          data: {
            tokenHash: next.hash,
            appId: app.id,
            personId: current.personId,
            accountId: current.accountId,
            // RFC 6749 §6: the new refresh token keeps the original scope.
            scopes: current.scopes,
            authTime: current.authTime,
            expiresAt: new Date(now.getTime() + TOKEN_TTL.refreshToken * 1_000),
          },
        });
        const rotated = await tx.oAuthRefreshToken.updateMany({
          where: { id: current.id, revokedAt: null },
          data: { revokedAt: now, replacedById: created.id },
        });
        if (rotated.count !== 1) throw new RefreshReuseDetected();
      });
    } catch (error) {
      if (!(error instanceof RefreshReuseDetected)) throw error;
      await this.revokeRefreshTokens(current.personId, app.id);
      throw invalid();
    }

    return this.issueTokens(
      app,
      {
        personId: current.personId,
        accountId: current.accountId,
        scopes: requested,
        authTime: current.authTime,
      },
      next.token,
    );
  }

  /** RFC 7009: silently succeeds for unknown tokens. */
  async revoke(app: DeveloperApp, token: string): Promise<void> {
    await this.prisma.oAuthRefreshToken.updateMany({
      where: { tokenHash: sha256(token), appId: app.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async userInfo(access: {
    personId: string;
    scopes: string[];
    appId?: string;
  }): Promise<Record<string, unknown>> {
    const appId = access.appId ?? boundAccessApp(access.scopes);
    // Without the app we can't restrict claims to its organization tree:
    // fail closed rather than leak memberships.
    if (!appId)
      throw new InternalServerErrorException("OIDC access context missing");
    const app = await this.prisma.developerApp.findUniqueOrThrow({
      where: { id: appId },
      select: { organizationId: true },
    });
    const claims = await buildClaims(this.prisma, {
      personId: access.personId,
      scopes: access.scopes,
      appOrganizationId: app.organizationId,
    });
    return { sub: access.personId, ...claims };
  }

  async listConsents(personId: string): Promise<
    Array<{
      appId: string;
      clientId: string;
      appName: string;
      organizationName: string;
      scopes: Array<{ scope: string; label: string }>;
      grantedAt: Date;
    }>
  > {
    const consents = await this.prisma.oAuthConsent.findMany({
      where: {
        personId,
        revokedAt: null,
        app: { status: { not: DeveloperAppStatus.REVOKED } },
      },
      include: {
        app: {
          select: {
            id: true,
            clientId: true,
            name: true,
            organization: { select: { name: true } },
          },
        },
      },
      orderBy: { grantedAt: "desc" },
    });
    return consents.map((consent) => ({
      appId: consent.app.id,
      clientId: consent.app.clientId,
      appName: consent.app.name,
      organizationName: consent.app.organization.name,
      scopes: consent.scopes.map((scope) => ({
        scope,
        label: scopeLabel(scope),
      })),
      grantedAt: consent.grantedAt,
    }));
  }

  async revokeConsent(personId: string, appId: string): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const revoked = await tx.oAuthConsent.updateMany({
        where: { personId, appId, revokedAt: null },
        data: { revokedAt: now },
      });
      if (revoked.count === 0)
        throw new NotFoundException("No le diste acceso a esa app");
      await tx.oAuthRefreshToken.updateMany({
        where: { personId, appId, revokedAt: null },
        data: { revokedAt: now },
      });
    });
  }

  /**
   * docs/11 §Validación del pedido, in order. Errors are 400 Problem Details
   * and never redirect (the redirect_uri may not be the app's).
   */
  private async validate(
    request: AuthorizationRequest,
    options: { checkResponseType: boolean },
  ): Promise<ValidatedRequest> {
    const app = request.clientId
      ? await this.prisma.developerApp.findUnique({
          where: { clientId: request.clientId },
          include: { organization: { select: { name: true } } },
        })
      : null;
    if (
      !app ||
      app.status !== DeveloperAppStatus.ACTIVE ||
      !app.grantTypes.includes("authorization_code")
    )
      throw new BadRequestException(
        "La app no existe o no está habilitada para ingresar con Mi Rotaract",
      );
    if (!request.redirectUri || !app.redirectUris.includes(request.redirectUri))
      throw new BadRequestException(
        "La dirección de retorno (redirect_uri) no está registrada para esta app",
      );
    if (options.checkResponseType && request.responseType !== "code")
      throw new BadRequestException('response_type debe ser "code"');
    if (request.codeChallengeMethod !== "S256")
      throw new BadRequestException('code_challenge_method debe ser "S256"');
    if (!CODE_CHALLENGE.test(request.codeChallenge ?? ""))
      throw new BadRequestException(
        "code_challenge debe tener entre 43 y 128 caracteres base64url",
      );
    const scopes = parseScope(request.scope);
    if (!scopes.includes("openid"))
      throw new BadRequestException(
        'Los permisos pedidos deben incluir "openid"',
      );
    const notAllowed = scopes.filter(
      (scope) => !isOidcScope(scope) || !app.scopes.includes(scope),
    );
    if (notAllowed.length > 0)
      throw new BadRequestException(
        `La app no puede pedir estos permisos: ${notAllowed.join(", ")}`,
      );
    return { app, scopes };
  }

  private async issueTokens(
    app: DeveloperApp,
    grant: Grant,
    refreshToken?: string,
  ): Promise<TokenResponse> {
    const scope = grant.scopes.join(" ");
    const accessToken = await this.keys.sign(
      {
        client_id: app.clientId,
        azp: app.clientId,
        token_use: "user",
        scope,
      },
      {
        audience: KERNEL_AUDIENCE,
        subject: grant.personId,
        expiresIn: TOKEN_TTL.userAccessToken,
      },
    );
    const claims = await buildClaims(this.prisma, {
      personId: grant.personId,
      scopes: grant.scopes,
      appOrganizationId: app.organizationId,
    });
    const idToken = await this.keys.sign(
      {
        ...claims,
        azp: app.clientId,
        auth_time: Math.floor(grant.authTime.getTime() / 1_000),
        ...(grant.nonce ? { nonce: grant.nonce } : {}),
      },
      {
        audience: app.clientId,
        subject: grant.personId,
        expiresIn: TOKEN_TTL.idToken,
      },
    );

    let refresh = refreshToken;
    if (!refresh && app.grantTypes.includes("refresh_token")) {
      const issued = newOpaqueToken("mrr_", 48);
      await this.prisma.oAuthRefreshToken.create({
        data: {
          tokenHash: issued.hash,
          appId: app.id,
          personId: grant.personId,
          accountId: grant.accountId,
          scopes: grant.scopes,
          authTime: grant.authTime,
          expiresAt: new Date(Date.now() + TOKEN_TTL.refreshToken * 1_000),
        },
      });
      refresh = issued.token;
    }

    return {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: TOKEN_TTL.userAccessToken,
      scope,
      id_token: idToken,
      ...(refresh ? { refresh_token: refresh } : {}),
    };
  }

  private async assertAccountActive(
    accountId: string,
    personId: string,
  ): Promise<void> {
    const account = await this.prisma.userAccount.findUnique({
      where: { id: accountId },
      select: { status: true, personId: true },
    });
    if (
      !account ||
      account.personId !== personId ||
      account.status !== AccountStatus.ACTIVE
    )
      throw new OAuthError("invalid_grant", "The account is not active");
  }

  private async assertConsent(personId: string, appId: string): Promise<void> {
    const consent = await this.prisma.oAuthConsent.findUnique({
      where: { personId_appId: { personId, appId } },
      select: { revokedAt: true },
    });
    if (!consent || consent.revokedAt)
      throw new OAuthError("invalid_grant", "Access was revoked");
  }

  private async revokeRefreshTokens(
    personId: string,
    appId: string,
  ): Promise<void> {
    await this.prisma.oAuthRefreshToken.updateMany({
      where: { personId, appId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
