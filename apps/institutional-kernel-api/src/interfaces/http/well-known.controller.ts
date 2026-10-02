import { Controller, Get } from "@nestjs/common";

import { webUrl } from "../../application/shared/web-url";
import { OIDC_SCOPES, SERVICE_SCOPES } from "../../application/oauth/scopes";
import { SigningKeyService } from "../../infrastructure/crypto/signing-key.service";

/**
 * OpenID Connect discovery (E3). The issuer is the Kernel API base URL, so
 * these live under it: {issuer}/.well-known/openid-configuration. The
 * authorization endpoint is the Web (it hosts login + consent).
 */
@Controller(".well-known")
export class WellKnownController {
  constructor(private readonly keys: SigningKeyService) {}

  @Get("openid-configuration") openidConfiguration() {
    const issuer = this.keys.issuer();
    return {
      issuer,
      authorization_endpoint: webUrl("/oauth/authorize"),
      token_endpoint: `${issuer}/oauth/token`,
      userinfo_endpoint: `${issuer}/oauth/userinfo`,
      revocation_endpoint: `${issuer}/oauth/revoke`,
      jwks_uri: `${issuer}/.well-known/jwks.json`,
      response_types_supported: ["code"],
      grant_types_supported: [
        "authorization_code",
        "refresh_token",
        "client_credentials",
      ],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["ES256"],
      token_endpoint_auth_methods_supported: [
        "client_secret_basic",
        "client_secret_post",
        "none",
      ],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: [...Object.keys(OIDC_SCOPES), ...SERVICE_SCOPES],
      claims_supported: [
        "sub",
        "name",
        "given_name",
        "family_name",
        "picture",
        "email",
        "email_verified",
        "memberships",
        "positions",
      ],
    };
  }

  @Get("jwks.json") jwks() {
    return this.keys.jwks();
  }
}
