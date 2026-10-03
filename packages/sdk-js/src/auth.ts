import { jwtVerify, type JWTPayload } from "jose";

import { Discovery, JwksCache } from "./discovery.ts";
import {
  MiRotaractConfigError,
  MiRotaractError,
  MiRotaractOAuthError,
} from "./errors.ts";
import {
  basicAuth,
  HttpClient,
  isBrowserLike,
  type HttpOptions,
} from "./http.ts";
import type {
  IdTokenClaims,
  OpenIdConfiguration,
  TokenResponse,
  TokenSet,
  UserInfo,
} from "./types.ts";

/** `aud` of access tokens that call the Kernel's own APIs. */
export const KERNEL_AUDIENCE = "institutional-kernel";

export type ClientAuthMethod = "client_secret_basic" | "client_secret_post";

export type ClientCredentials = {
  clientId: string;
  clientSecret?: string;
  /** Default `client_secret_basic`. Ignored for public clients (no secret). */
  clientAuthMethod?: ClientAuthMethod;
};

function cryptoApi(): Crypto {
  const c = globalThis.crypto;
  if (!c?.subtle || !c.getRandomValues)
    throw new MiRotaractError(
      "Web Crypto no está disponible (globalThis.crypto). Usá Node 20+ o Node 18 con --experimental-global-webcrypto.",
    );
  return c;
}

export function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function randomToken(bytes = 32): string {
  const buffer = new Uint8Array(bytes);
  cryptoApi().getRandomValues(buffer);
  return base64url(buffer);
}

/** PKCE S256 (RFC 7636 §4.2): base64url(sha256(verifier)). */
export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await cryptoApi().subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return base64url(new Uint8Array(digest));
}

export function assertSecretAllowed(
  clientSecret: string | undefined,
  dangerouslyAllowBrowser: boolean | undefined,
): void {
  if (clientSecret && isBrowserLike() && !dangerouslyAllowBrowser)
    throw new MiRotaractConfigError(
      "Un client secret nunca debe llegar al navegador: cualquiera podría leerlo. " +
        "En el navegador usá una app PUBLIC (solo clientId + PKCE) y dejá el secreto en tu servidor.",
    );
}

function toTokenSet(response: TokenResponse): TokenSet {
  if (!response?.access_token)
    throw new MiRotaractOAuthError(
      "invalid_response",
      "El endpoint de tokens no devolvió access_token",
    );
  const expiresIn = Number(response.expires_in ?? 0);
  return {
    accessToken: response.access_token,
    tokenType: response.token_type ?? "Bearer",
    expiresIn,
    expiresAt: Date.now() + expiresIn * 1000,
    scope: response.scope ?? "",
    ...(response.id_token ? { idToken: response.id_token } : {}),
    ...(response.refresh_token ? { refreshToken: response.refresh_token } : {}),
  };
}

/** POST to the token endpoint with client authentication (RFC 6749 §2.3). */
export async function requestToken(
  http: HttpClient,
  tokenEndpoint: string,
  client: ClientCredentials,
  params: Record<string, string | undefined>,
): Promise<TokenSet> {
  const form: Record<string, string | undefined> = { ...params };
  const headers: Record<string, string> = {};
  if (client.clientSecret) {
    if (client.clientAuthMethod === "client_secret_post") {
      form.client_id = client.clientId;
      form.client_secret = client.clientSecret;
    } else
      headers.authorization = basicAuth(client.clientId, client.clientSecret);
  } else form.client_id = client.clientId;
  const { data } = await http.request<TokenResponse>({
    method: "POST",
    url: tokenEndpoint,
    headers,
    form,
    // The Kernel counts the app's quota before handling the grant, so a
    // 429 never consumed a code or rotated a refresh token.
    retryOnRateLimit: true,
  });
  return toTokenSet(data);
}

export type MiRotaractAuthOptions = HttpOptions &
  ClientCredentials & {
    /** Kernel API base URL, e.g. https://api.rotaract4845.com/api/kernel/v1 */
    issuer: string;
    /** Must match one of the app's registered redirect URIs exactly. */
    redirectUri: string;
    /** Default scope for `authorizationUrl`. Default "openid profile email". */
    scope?: string | string[];
    /** Accepted clock skew when verifying tokens, in seconds. Default 30. */
    clockToleranceSec?: number;
    /** Allows a client secret in a browser-like runtime. Don't. */
    dangerouslyAllowBrowser?: boolean;
    /** JWKS cache lifetime. Default 10 min. */
    jwksTtlMs?: number;
    /** Minimum time between JWKS re-fetches triggered by an unknown `kid`. Default 30 s. */
    jwksCooldownMs?: number;
  };

export type AuthorizationRequest = {
  url: string;
  /** Keep it server-side (or in an encrypted cookie) until the callback. */
  codeVerifier: string;
  state: string;
  nonce: string;
};

export type ExchangeResult = TokenSet & {
  /** Verified ID token claims (present whenever the server sent an id_token). */
  claims?: IdTokenClaims;
};

function scopeString(
  scope: string | string[] | undefined,
  fallback: string,
): string {
  if (!scope) return fallback;
  return Array.isArray(scope) ? scope.join(" ") : scope;
}

/**
 * "Ingresar con Mi Rotaract": OAuth 2.0 authorization code + PKCE (S256) and
 * OpenID Connect. Works in Node, edge runtimes and browsers (browsers: only
 * PUBLIC apps, without clientSecret).
 */
export class MiRotaractAuth {
  readonly clientId: string;
  readonly redirectUri: string;
  private readonly clientSecret: string | undefined;
  private readonly clientAuthMethod: ClientAuthMethod | undefined;
  private readonly defaultScope: string;
  private readonly clockTolerance: number;
  private readonly http: HttpClient;
  private readonly discoveryDoc: Discovery;
  private readonly jwks: JwksCache;

  constructor(options: MiRotaractAuthOptions) {
    if (!options?.clientId)
      throw new MiRotaractConfigError("Falta `clientId`.");
    if (!options.redirectUri)
      throw new MiRotaractConfigError("Falta `redirectUri`.");
    assertSecretAllowed(options.clientSecret, options.dangerouslyAllowBrowser);
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.clientAuthMethod = options.clientAuthMethod;
    this.redirectUri = options.redirectUri;
    this.defaultScope = scopeString(options.scope, "openid profile email");
    this.clockTolerance = options.clockToleranceSec ?? 30;
    this.http = new HttpClient(options);
    this.discoveryDoc = new Discovery(options.issuer, this.http);
    this.jwks = new JwksCache(
      this.http,
      async () => (await this.discovery()).jwks_uri,
      options.jwksTtlMs,
      options.jwksCooldownMs,
    );
  }

  get issuer(): string {
    return this.discoveryDoc.issuer;
  }

  discovery(): Promise<OpenIdConfiguration> {
    return this.discoveryDoc.get();
  }

  /**
   * Builds the URL to send the person to. Store `codeVerifier`, `state` and
   * `nonce` (server-side session or encrypted cookie) for the callback.
   */
  async authorizationUrl(
    options: {
      scope?: string | string[];
      state?: string;
      nonce?: string;
      redirectUri?: string;
      extraParams?: Record<string, string>;
    } = {},
  ): Promise<AuthorizationRequest> {
    const config = await this.discovery();
    const codeVerifier = randomToken(32);
    const state = options.state ?? randomToken(16);
    const nonce = options.nonce ?? randomToken(16);
    const url = new URL(config.authorization_endpoint);
    const params: Record<string, string> = {
      response_type: "code",
      client_id: this.clientId,
      redirect_uri: options.redirectUri ?? this.redirectUri,
      scope: scopeString(options.scope, this.defaultScope),
      state,
      nonce,
      code_challenge: await pkceChallenge(codeVerifier),
      code_challenge_method: "S256",
      ...options.extraParams,
    };
    for (const [key, value] of Object.entries(params))
      url.searchParams.set(key, value);
    return { url: url.toString(), codeVerifier, state, nonce };
  }

  /**
   * Reads `code`/`state`/`error` from the callback URL and checks `state`.
   * Throws `MiRotaractOAuthError` (`access_denied`, `invalid_state`, ...).
   */
  parseCallback(
    callback: string | URL | URLSearchParams,
    expected: { state: string },
  ): { code: string; state: string } {
    const params =
      callback instanceof URLSearchParams
        ? callback
        : new URL(String(callback), "http://callback.invalid").searchParams;
    const error = params.get("error");
    if (error)
      throw new MiRotaractOAuthError(
        error,
        params.get("error_description") ?? undefined,
      );
    const state = params.get("state") ?? "";
    if (!expected?.state || state !== expected.state)
      throw new MiRotaractOAuthError(
        "invalid_state",
        "El state del callback no coincide",
      );
    const code = params.get("code");
    if (!code)
      throw new MiRotaractOAuthError(
        "invalid_request",
        "Falta code en el callback",
      );
    return { code, state };
  }

  /** Exchanges the authorization code (with its PKCE verifier) and verifies the ID token. */
  async exchangeCode(options: {
    code: string;
    codeVerifier: string;
    /** When given, the ID token's nonce must match. */
    nonce?: string;
    redirectUri?: string;
  }): Promise<ExchangeResult> {
    const config = await this.discovery();
    const tokens = await requestToken(
      this.http,
      config.token_endpoint,
      this.client(),
      {
        grant_type: "authorization_code",
        code: options.code,
        code_verifier: options.codeVerifier,
        redirect_uri: options.redirectUri ?? this.redirectUri,
      },
    );
    if (!tokens.idToken) {
      if (options.nonce)
        throw new MiRotaractOAuthError(
          "invalid_token",
          "El servidor no devolvió id_token",
        );
      return tokens;
    }
    const claims = await this.verifyIdToken(tokens.idToken, {
      nonce: options.nonce,
    });
    return { ...tokens, claims };
  }

  /** Rotates the refresh token: always store the new `refreshToken`. */
  async refresh(
    refreshToken: string,
    options: { scope?: string | string[] } = {},
  ): Promise<ExchangeResult> {
    const config = await this.discovery();
    const tokens = await requestToken(
      this.http,
      config.token_endpoint,
      this.client(),
      {
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        scope: options.scope ? scopeString(options.scope, "") : undefined,
      },
    );
    if (!tokens.idToken) return tokens;
    return { ...tokens, claims: await this.verifyIdToken(tokens.idToken) };
  }

  /**
   * Verifies signature (remote JWKS, cached), `iss`, `aud` = clientId, `exp`,
   * `azp` and, when given, `nonce` and `maxAgeSec` (against `auth_time`).
   */
  async verifyIdToken(
    idToken: string,
    options: { nonce?: string; maxAgeSec?: number } = {},
  ): Promise<IdTokenClaims> {
    const payload = await this.verifyJwt(idToken, this.clientId);
    if (payload.azp !== undefined && payload.azp !== this.clientId)
      throw new MiRotaractOAuthError(
        "invalid_token",
        "azp no corresponde a esta app",
      );
    if (options.nonce !== undefined && payload.nonce !== options.nonce)
      throw new MiRotaractOAuthError("invalid_token", "nonce inválido");
    if (options.maxAgeSec !== undefined) {
      const authTime = Number(payload.auth_time);
      if (
        !Number.isFinite(authTime) ||
        Date.now() / 1000 - authTime > options.maxAgeSec + this.clockTolerance
      )
        throw new MiRotaractOAuthError(
          "invalid_token",
          "La autenticación es demasiado vieja",
        );
    }
    return payload as IdTokenClaims;
  }

  /**
   * Verifies a user access token locally (signature, iss, aud
   * institutional-kernel, token_use=user, issued to this app). Fast and
   * offline, but it can't see revocations; `userInfo` can.
   */
  async verifyAccessToken(
    accessToken: string,
  ): Promise<JWTPayload & { sub: string; scope?: string; client_id?: string }> {
    const payload = await this.verifyJwt(accessToken, KERNEL_AUDIENCE);
    if (payload.token_use !== "user")
      throw new MiRotaractOAuthError(
        "invalid_token",
        "No es un access token de usuario",
      );
    if (payload.client_id !== this.clientId && payload.azp !== this.clientId)
      throw new MiRotaractOAuthError(
        "invalid_token",
        "El token fue emitido para otra app",
      );
    return payload as JWTPayload & { sub: string };
  }

  async userInfo(accessToken: string): Promise<UserInfo> {
    const config = await this.discovery();
    const endpoint =
      config.userinfo_endpoint ?? `${this.issuer}/oauth/userinfo`;
    const { data } = await this.http.request<UserInfo>({
      method: "GET",
      url: endpoint,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    return data;
  }

  /** RFC 7009. Succeeds for unknown tokens too. */
  async revoke(
    token: string,
    options: { tokenTypeHint?: "refresh_token" | "access_token" } = {},
  ): Promise<void> {
    const config = await this.discovery();
    const endpoint =
      config.revocation_endpoint ?? `${this.issuer}/oauth/revoke`;
    const form: Record<string, string | undefined> = {
      token,
      token_type_hint: options.tokenTypeHint,
    };
    const headers: Record<string, string> = {};
    if (this.clientSecret && this.clientAuthMethod !== "client_secret_post")
      headers.authorization = basicAuth(this.clientId, this.clientSecret);
    else {
      form.client_id = this.clientId;
      if (this.clientSecret) form.client_secret = this.clientSecret;
    }
    await this.http.request({ method: "POST", url: endpoint, headers, form });
  }

  private client(): ClientCredentials {
    return {
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      clientAuthMethod: this.clientAuthMethod,
    };
  }

  private async verifyJwt(
    token: string,
    audience: string,
  ): Promise<JWTPayload & Record<string, unknown>> {
    if (typeof token !== "string" || token.split(".").length !== 3)
      throw new MiRotaractOAuthError(
        "invalid_token",
        "Formato de JWT inválido",
      );
    try {
      const { payload } = await jwtVerify(token, this.jwks.getKey, {
        issuer: this.issuer,
        audience,
        algorithms: ["ES256"],
        clockTolerance: this.clockTolerance,
      });
      return payload as JWTPayload & Record<string, unknown>;
    } catch (error) {
      if (error instanceof MiRotaractError) throw error;
      throw new MiRotaractOAuthError(
        "invalid_token",
        (error as Error)?.message ?? "Token inválido",
        undefined,
        { cause: error },
      );
    }
  }
}
