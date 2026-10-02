import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotImplementedException,
} from "@nestjs/common";
import type { Request } from "express";

export type OidcAccessRequest = Request & {
  oidc: { personId: string; appId: string; clientId: string; scopes: string[] };
};

/**
 * E3 — guards /oauth/userinfo: requires an ES256 access token issued by
 * /oauth/token to a third-party app (`token_use: "user"`), not revoked.
 * On failure respond 401 with an OAuthError("invalid_token").
 * OWNER: E3 agent.
 */
@Injectable()
export class OidcAccessGuard implements CanActivate {
  canActivate(_context: ExecutionContext): Promise<boolean> {
    throw new NotImplementedException();
  }
}
