import { Injectable, NotImplementedException } from "@nestjs/common";
import type { DeveloperApp } from "@prisma/client";

export type TokenResponse = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  scope: string;
  id_token?: string;
  refresh_token?: string;
};

/**
 * E2 — `grant_type=client_credentials`: an app's own token to call
 * /service/* within its organization.
 * OWNER: E2 agent. See docs/11-developer-platform-auth.md §Tokens.
 */
@Injectable()
export class ClientCredentialsGrant {
  issue(
    _app: DeveloperApp,
    _requestedScope: string | undefined,
  ): Promise<TokenResponse> {
    throw new NotImplementedException();
  }
}
