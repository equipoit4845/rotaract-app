import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { AccountStatus, DeveloperAppStatus } from "@prisma/client";
import type { Request, Response } from "express";

import { SigningKeyService } from "../../infrastructure/crypto/signing-key.service";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { bindAccessApp } from "./oidc-access-context";
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
 * Sends the RFC 6750 §3.1 error and makes later writes to this response
 * no-ops. The global ProblemFilter would otherwise answer the
 * ForbiddenException Nest raises for `false` with Problem Details (and
 * fail with "headers already sent"); OAuth clients expect this exact shape.
 */
function rejectInvalidToken(response: Response): false {
  response.setHeader("WWW-Authenticate", 'Bearer error="invalid_token"');
  response.setHeader("Cache-Control", "no-store");
  response.status(401).json({ error: "invalid_token" });
  const sealed = response as unknown as Record<string, unknown>;
  for (const method of ["status", "type", "set", "header", "send", "json"])
    sealed[method] = () => response;
  return false;
}

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
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<OidcAccessRequest>();
    const response = http.getResponse<Response>();
    const access = await this.resolve(request);
    if (!access) return rejectInvalidToken(response);
    bindAccessApp(access.scopes, access.appId);
    request.oidc = access;
    return true;
  }

  private async resolve(
    request: Request,
  ): Promise<OidcAccessRequest["oidc"] | undefined> {
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
      select: { id: true, status: true },
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
    };
  }
}
