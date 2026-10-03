import { Injectable } from "@nestjs/common";
import type { DeveloperApp } from "@prisma/client";

import { SigningKeyService } from "../../infrastructure/crypto/signing-key.service";
import { effectiveServiceScopes } from "../governance/review-policy";
import { OAuthError } from "./oauth-error";
import {
  isServiceScope,
  KERNEL_AUDIENCE,
  parseScope,
  TOKEN_TTL,
} from "./scopes";

export type TokenResponse = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  scope: string;
  id_token?: string;
  refresh_token?: string;
};

/** Claims of a service token (docs/11-developer-platform-auth.md §"Token de servicio"). */
export type ServiceTokenClaims = {
  client_id: string;
  azp: string;
  token_use: "service";
  scope: string;
  org: string;
};

/**
 * E2 — `grant_type=client_credentials`: an app's own token to call
 * /service/* within its organization. The caller (OAuthController) has
 * already authenticated the client and checked it holds this grant.
 */
@Injectable()
export class ClientCredentialsGrant {
  constructor(private readonly keys: SigningKeyService) {}

  async issue(
    app: DeveloperApp,
    requestedScope: string | undefined,
  ): Promise<TokenResponse> {
    const all: string[] = app.scopes.filter(isServiceScope);
    // E11.1: until the district approves them, scopes with personal data
    // are not issued (docs/18-data-governance.md §"Mientras está en revisión").
    const granted = effectiveServiceScopes({
      scopes: all,
      approvedScopes: app.approvedScopes ?? all,
    });
    const requested = parseScope(requestedScope);
    const missing = requested.filter((scope) => !all.includes(scope));
    if (missing.length)
      throw new OAuthError(
        "invalid_scope",
        `This app is not allowed to request: ${missing.join(" ")}`,
      );
    const inReview = requested.filter((scope) => !granted.includes(scope));
    if (inReview.length)
      throw new OAuthError(
        "invalid_scope",
        `Pending the district's review (app in review): ${inReview.join(" ")}`,
      );
    if (granted.length === 0)
      throw new OAuthError(
        "invalid_scope",
        "The app is in review: none of its service scopes is approved yet",
      );
    const scope = (requested.length ? requested : granted).join(" ");
    const claims: ServiceTokenClaims = {
      client_id: app.clientId,
      azp: app.clientId,
      token_use: "service",
      scope,
      org: app.organizationId,
    };
    const accessToken = await this.keys.sign(claims, {
      audience: KERNEL_AUDIENCE,
      subject: `app:${app.clientId}`,
      expiresIn: TOKEN_TTL.serviceAccessToken,
    });
    return {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: TOKEN_TTL.serviceAccessToken,
      scope,
    };
  }
}
