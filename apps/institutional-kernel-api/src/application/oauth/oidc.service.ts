import { Injectable, NotImplementedException } from "@nestjs/common";
import type { DeveloperApp } from "@prisma/client";

import type { TokenResponse } from "./client-credentials.grant";

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

/**
 * E3 — "Ingresar con Mi Rotaract": authorization code + PKCE, refresh
 * tokens, userinfo and consents.
 * OWNER: E3 agent. See docs/11-developer-platform-auth.md §E3.
 */
@Injectable()
export class OidcService {
  authorizationContext(
    _personId: string,
    _request: AuthorizationRequest,
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
    throw new NotImplementedException();
  }
  authorize(
    _user: { personId: string; accountId: string },
    _request: AuthorizationRequest & { decision: "approve" | "deny" },
  ): Promise<{ redirectTo: string }> {
    throw new NotImplementedException();
  }
  /** grant_type=authorization_code (throws OAuthError on failure). */
  exchangeCode(
    _app: DeveloperApp,
    _params: { code?: string; redirectUri?: string; codeVerifier?: string },
  ): Promise<TokenResponse> {
    throw new NotImplementedException();
  }
  /** grant_type=refresh_token, with rotation and reuse detection. */
  refresh(
    _app: DeveloperApp,
    _params: { refreshToken?: string; scope?: string },
  ): Promise<TokenResponse> {
    throw new NotImplementedException();
  }
  /** RFC 7009: silently succeeds for unknown tokens. */
  revoke(_app: DeveloperApp, _token: string): Promise<void> {
    throw new NotImplementedException();
  }
  userInfo(_access: {
    personId: string;
    scopes: string[];
  }): Promise<Record<string, unknown>> {
    throw new NotImplementedException();
  }
  listConsents(_personId: string): Promise<
    Array<{
      appId: string;
      clientId: string;
      appName: string;
      organizationName: string;
      scopes: Array<{ scope: string; label: string }>;
      grantedAt: Date;
    }>
  > {
    throw new NotImplementedException();
  }
  revokeConsent(_personId: string, _appId: string): Promise<void> {
    throw new NotImplementedException();
  }
}
