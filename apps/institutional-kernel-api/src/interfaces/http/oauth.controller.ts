import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";

import type { AuthenticatedRequest } from "../../application/auth/jwt-session.guard";
import { ClientAuthenticator } from "../../application/oauth/client-authenticator";
import { ClientCredentialsGrant } from "../../application/oauth/client-credentials.grant";
import {
  OidcAccessGuard,
  type OidcAccessRequest,
} from "../../application/oauth/oidc-access.guard";
import { OidcService } from "../../application/oauth/oidc.service";
import { OAuthError } from "../../application/oauth/oauth-error";
import { markDeveloperAppRequest } from "../../application/request-logs/request-log.context";
import { setProblemMark } from "./request-log.middleware";
// E11 (docs/18-data-governance.md): quotas, access history, audit.
import { AppQuotaService } from "../../application/governance/app-quota.service";
import { AccessHistoryWriter } from "../../application/governance/access-history.writer";
import { HttpCommandContextFactory } from "./command-context.factory";

type TokenParams = {
  grant_type?: string;
  client_id?: string;
  client_secret?: string;
  scope?: string;
  code?: string;
  redirect_uri?: string;
  code_verifier?: string;
  refresh_token?: string;
  token?: string;
};

/**
 * client_secret_basic (Authorization: Basic base64(id:secret), each part
 * form-urlencoded per RFC 6749 §2.3.1) or client_secret_post / none.
 */
function clientCredentials(
  request: Request,
  body: TokenParams,
): { clientId?: string; clientSecret?: string } {
  const basic = request.headers.authorization?.match(/^Basic\s+(.+)$/i)?.[1];
  if (basic) {
    const decoded = Buffer.from(basic, "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 0)
      throw new OAuthError("invalid_client", "Malformed Basic credentials");
    return {
      clientId: decodeURIComponent(decoded.slice(0, separator)),
      clientSecret: decodeURIComponent(decoded.slice(separator + 1)),
    };
  }
  return { clientId: body.client_id, clientSecret: body.client_secret };
}

/** Sends RFC 6749 errors as-is; anything else propagates to ProblemFilter. */
async function oauthResponse<T>(
  response: Response,
  work: () => Promise<T>,
): Promise<T | undefined> {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Pragma", "no-cache");
  try {
    return await work();
  } catch (error) {
    if (!(error instanceof OAuthError)) throw error;
    if (error.status === 401)
      response.setHeader("WWW-Authenticate", 'Basic realm="mirotaract"');
    setProblemMark(response, { code: error.error, type: "oauth" });
    response.status(error.status).json(error.toJSON());
    return undefined;
  }
}

/** E3 (and the client_credentials grant of E2). */
@Controller("oauth")
export class OAuthController {
  constructor(
    private readonly clients: ClientAuthenticator,
    private readonly clientCredentials: ClientCredentialsGrant,
    private readonly oidc: OidcService,
    private readonly quotas: AppQuotaService,
    private readonly history: AccessHistoryWriter,
    private readonly contexts: HttpCommandContextFactory,
  ) {}

  @Get("apps/:clientId") getPublicDeveloperApp(
    @Param("clientId") clientId: string,
  ) {
    return this.clients.publicInfo(clientId);
  }

  @Get("authorize/context") getAuthorizationContext(
    @Query() query: Record<string, string | undefined>,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.oidc.authorizationContext(request.user.personId, {
      clientId: query.client_id ?? "",
      redirectUri: query.redirect_uri ?? "",
      scope: query.scope ?? "",
      responseType: query.response_type,
      codeChallenge: query.code_challenge ?? "",
      codeChallengeMethod: query.code_challenge_method ?? "",
    });
  }

  @Post("authorize")
  @HttpCode(200)
  authorizeOAuthRequest(
    @Body()
    body: {
      clientId: string;
      redirectUri: string;
      scope: string;
      state?: string | null;
      nonce?: string | null;
      codeChallenge: string;
      codeChallengeMethod: string;
      decision: "approve" | "deny";
    },
    @Req() request: AuthenticatedRequest,
  ) {
    return this.oidc.authorize(
      { personId: request.user.personId, accountId: request.user.accountId },
      body,
    );
  }

  @Post("token")
  @HttpCode(200)
  issueOAuthToken(
    @Body() body: TokenParams,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return oauthResponse(response, async () => {
      const grantType = body?.grant_type;
      if (!grantType)
        throw new OAuthError("invalid_request", "grant_type is required");
      if (
        !["client_credentials", "authorization_code", "refresh_token"].includes(
          grantType,
        )
      )
        throw new OAuthError("unsupported_grant_type");
      const app = await this.clients.authenticate(
        clientCredentials(request, body),
      );
      // E9.3: from here on the request is the app's (request logs).
      markDeveloperAppRequest(request, app);
      // E11.3: and it counts against the app's quota.
      await this.quotas.consume(app, response);
      if (!app.grantTypes.includes(grantType))
        throw new OAuthError(
          "unauthorized_client",
          `This app is not allowed to use ${grantType}`,
        );
      if (grantType === "client_credentials")
        return this.clientCredentials.issue(app, body.scope);
      if (grantType === "authorization_code")
        return this.oidc.exchangeCode(app, {
          code: body.code,
          redirectUri: body.redirect_uri,
          codeVerifier: body.code_verifier,
        });
      return this.oidc.refresh(app, {
        refreshToken: body.refresh_token,
        scope: body.scope,
      });
    });
  }

  @Post("revoke")
  @HttpCode(200)
  revokeOAuthToken(
    @Body() body: TokenParams,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return oauthResponse(response, async () => {
      const app = await this.clients.authenticate(
        clientCredentials(request, body),
      );
      // E9.3: from here on the request is the app's (request logs).
      markDeveloperAppRequest(request, app);
      await this.quotas.consume(app, response);
      if (body?.token) await this.oidc.revoke(app, body.token);
      return {};
    });
  }

  @Get("userinfo")
  @UseGuards(OidcAccessGuard)
  getOAuthUserInfo(@Req() request: OidcAccessRequest) {
    // E11.2: the person's access history.
    this.history.record({
      personId: request.oidc.personId,
      appId: request.oidc.appId,
      kind: "USERINFO",
      details: request.oidc.scopes,
    });
    return this.oidc.userInfo({
      personId: request.oidc.personId,
      scopes: request.oidc.scopes,
      appId: request.oidc.appId,
    });
  }

  @Get("consents") listOAuthConsents(@Req() request: AuthenticatedRequest) {
    return this.oidc.listConsents(request.user.personId);
  }

  @Delete("consents/:appId")
  @HttpCode(204)
  async revokeOAuthConsent(
    @Param("appId") appId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.oidc.revokeConsent(
      request.user.personId,
      appId,
      this.contexts.from(request, "revokeOAuthConsent"),
    );
  }
}
