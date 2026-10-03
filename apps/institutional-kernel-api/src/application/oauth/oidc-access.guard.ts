import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Optional,
} from "@nestjs/common";
import { AccountStatus, DeveloperAppStatus } from "@prisma/client";
import type { Request } from "express";

import { SigningKeyService } from "../../infrastructure/crypto/signing-key.service";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import {
  AppQuotaService,
  type QuotaApp,
} from "../governance/app-quota.service";
import { OAuthError } from "./oauth-error";
import { KERNEL_AUDIENCE, isOidcScope, parseScope } from "./scopes";

export type OidcAccessRequest = Request & {
  oidc: { personId: string; appId: string; clientId: string; scopes: string[] };
};

type UserAccessToken = {
  sub?: string;
  client_id?: string;
  token_use?: string;
  scope?: string;
};

/**
 * E3 — guards /oauth/userinfo: requires an ES256 access token issued by
 * /oauth/token to a third-party app (`token_use: "user"`), whose app is
 * still ACTIVE, whose consent is still in force and whose account is still
 * ACTIVE. Anything else: 401 `{ "error": "invalid_token" }`.
 */
@Injectable()
export class OidcAccessGuard implements CanActivate {
  constructor(
    private readonly keys: SigningKeyService,
    private readonly prisma: PrismaService,
    @Optional() private readonly quotas?: AppQuotaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<OidcAccessRequest>();
    const access = await this.resolve(request);
    // ProblemFilter renders OAuthError as RFC 6750 (401 + WWW-Authenticate).
    if (!access) throw new OAuthError("invalid_token");
    const { quotaApp, ...oidc } = access;
    request.oidc = oidc;
    // E11.3: userinfo calls count against the app's quota.
    await this.quotas?.consume(quotaApp, context.switchToHttp().getResponse());
    return true;
  }

  private async resolve(
    request: Request,
  ): Promise<(OidcAccessRequest["oidc"] & { quotaApp: QuotaApp }) | undefined> {
    const token = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return undefined;
    let payload: UserAccessToken;
    try {
      payload = await this.keys.verify<UserAccessToken>(token, {
        audience: KERNEL_AUDIENCE,
      });
    } catch {
      return undefined;
    }
    if (
      payload.token_use !== "user" ||
      typeof payload.sub !== "string" ||
      typeof payload.client_id !== "string"
    )
      return undefined;

    const app = await this.prisma.developerApp.findUnique({
      where: { clientId: payload.client_id },
      select: {
        id: true,
        status: true,
        quotaPerMinute: true,
        quotaPerDay: true,
        approvedAt: true,
      },
    });
    if (!app || app.status !== DeveloperAppStatus.ACTIVE) return undefined;
    const [consent, account] = await Promise.all([
      this.prisma.oAuthConsent.findUnique({
        where: { personId_appId: { personId: payload.sub, appId: app.id } },
        select: { revokedAt: true, scopes: true },
      }),
      this.prisma.userAccount.findUnique({
        where: { personId: payload.sub },
        select: { status: true },
      }),
    ]);
    if (!consent || consent.revokedAt) return undefined;
    if (!account || account.status !== AccountStatus.ACTIVE) return undefined;

    // Never more than what the person consented to, and only OIDC scopes.
    const scopes = parseScope(payload.scope).filter(
      (scope) => isOidcScope(scope) && consent.scopes.includes(scope),
    );
    if (!scopes.includes("openid")) return undefined;
    return {
      personId: payload.sub,
      appId: app.id,
      clientId: payload.client_id,
      scopes,
      quotaApp: {
        clientId: payload.client_id,
        quotaPerMinute: app.quotaPerMinute,
        quotaPerDay: app.quotaPerDay,
        approvedAt: app.approvedAt,
      },
    };
  }
}
