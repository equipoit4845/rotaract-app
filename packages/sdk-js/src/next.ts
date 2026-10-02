import { EncryptJWT, jwtDecrypt, type JWTPayload } from "jose";

import type { MiRotaractAuth } from "./auth.ts";
import { MiRotaractConfigError, MiRotaractOAuthError } from "./errors.ts";
import type { IdTokenClaims } from "./types.ts";

/**
 * Next.js (App Router) helpers built on Web `Request`/`Response`, so they
 * also work in any fetch-style runtime (Remix, Hono, SvelteKit, edge).
 *
 * The session lives in an encrypted, httpOnly cookie (JWE, `dir` +
 * A256GCM, key derived from `secret`). It is independent of the ID token's
 * 10-minute lifetime: the app decides how long a login lasts
 * (`sessionMaxAgeSec`, default 8 h). Tokens are NOT stored unless
 * `storeTokens: true` (needed to call `/oauth/userinfo` later or to revoke
 * on logout).
 *
 * ```ts
 * // lib/mirotaract.ts
 * export const mr = createMiRotaractNext({ auth, secret: process.env.SESSION_SECRET! });
 * // app/auth/login/route.ts     export const GET = mr.login;
 * // app/auth/callback/route.ts  export const GET = mr.callback;
 * // app/auth/logout/route.ts    export const POST = mr.logout;
 * // anywhere on the server:     const session = await mr.getSession(cookies());
 * ```
 */

export type SessionUser = Pick<
  IdTokenClaims,
  | "sub"
  | "name"
  | "given_name"
  | "family_name"
  | "picture"
  | "email"
  | "email_verified"
  | "memberships"
  | "positions"
>;

export type MiRotaractSession = {
  user: SessionUser;
  /** Epoch ms when this app session ends. */
  expiresAt: number;
  accessToken?: string;
  accessTokenExpiresAt?: number;
  refreshToken?: string;
};

export type MiRotaractNextOptions = {
  auth: MiRotaractAuth;
  /** At least 32 characters of entropy. Rotating it logs everybody out. */
  secret: string;
  scope?: string | string[];
  /** Default "mirotaract_session" (the login transaction uses `${cookieName}_tx`). */
  cookieName?: string;
  /** Default 8 h. */
  sessionMaxAgeSec?: number;
  /** Store access/refresh tokens in the encrypted cookie. Default false. */
  storeTokens?: boolean;
  /** Default "/". Only same-site relative paths are accepted as `returnTo`. */
  afterLoginPath?: string;
  afterLogoutPath?: string;
  /** Where to send the person when the login fails; `?error=<code>` is appended. Default "/". */
  errorPath?: string;
  /** Force the Secure flag; default: on when the request is https. */
  secureCookies?: boolean;
  /** Cookie path. Default "/". */
  cookiePath?: string;
};

type CookieSource =
  | Request
  | Headers
  | string
  | null
  | undefined
  | { get(name: string): { value: string } | undefined };

const TX_MAX_AGE = 10 * 60;

function parseCookies(
  header: string | null | undefined,
): Record<string, string> {
  const result: Record<string, string> = {};
  if (!header) return result;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    if (!name || name in result) continue;
    try {
      result[name] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      result[name] = part.slice(index + 1).trim();
    }
  }
  return result;
}

function safeRelativePath(
  value: string | null | undefined,
  fallback: string,
): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.startsWith("/\\")
  )
    return fallback;
  return value;
}

export function createMiRotaractNext(options: MiRotaractNextOptions) {
  if (!options?.auth)
    throw new MiRotaractConfigError("Falta `auth` (MiRotaractAuth).");
  if (!options.secret || options.secret.length < 32)
    throw new MiRotaractConfigError(
      "`secret` debe tener al menos 32 caracteres.",
    );
  const cookieName = options.cookieName ?? "mirotaract_session";
  const txCookie = `${cookieName}_tx`;
  const maxAge = options.sessionMaxAgeSec ?? 8 * 60 * 60;
  const cookiePath = options.cookiePath ?? "/";
  const afterLogin = options.afterLoginPath ?? "/";
  const afterLogout = options.afterLogoutPath ?? "/";
  const errorPath = options.errorPath ?? "/";
  let keyPromise: Promise<Uint8Array> | undefined;

  const key = () =>
    (keyPromise ??= crypto.subtle
      .digest(
        "SHA-256",
        new TextEncoder().encode(`mirotaract-session:${options.secret}`),
      )
      .then((digest) => new Uint8Array(digest)));

  async function seal(payload: JWTPayload, ttlSec: number): Promise<string> {
    return new EncryptJWT(payload)
      .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSec)
      .encrypt(await key());
  }

  async function unseal<T>(value: string | undefined): Promise<T | null> {
    if (!value) return null;
    try {
      const { payload } = await jwtDecrypt(value, await key());
      return payload as T;
    } catch {
      return null;
    }
  }

  function cookie(
    request: Request,
    name: string,
    value: string,
    ttlSec: number,
  ): string {
    const secure =
      options.secureCookies ?? new URL(request.url).protocol === "https:";
    return [
      `${name}=${encodeURIComponent(value)}`,
      `Path=${cookiePath}`,
      "HttpOnly",
      "SameSite=Lax",
      ...(secure ? ["Secure"] : []),
      `Max-Age=${ttlSec}`,
    ].join("; ");
  }

  function redirect(location: string, cookies: string[] = []): Response {
    const headers = new Headers({ location, "cache-control": "no-store" });
    for (const value of cookies) headers.append("set-cookie", value);
    return new Response(null, { status: 302, headers });
  }

  function cookieValue(source: CookieSource, name: string): string | undefined {
    if (!source) return undefined;
    if (typeof source === "string") return parseCookies(source)[name];
    if (source instanceof Headers)
      return parseCookies(source.get("cookie"))[name];
    if (typeof Request !== "undefined" && source instanceof Request)
      return parseCookies(source.headers.get("cookie"))[name];
    if (typeof (source as { get?: unknown }).get === "function")
      return (
        source as { get(name: string): { value: string } | undefined }
      ).get(name)?.value;
    return undefined;
  }

  /** GET /auth/login?returnTo=/ruta → redirect to Mi Rotaract. */
  async function login(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const returnTo = safeRelativePath(
      url.searchParams.get("returnTo"),
      afterLogin,
    );
    const authRequest = await options.auth.authorizationUrl({
      scope: options.scope,
    });
    const tx = await seal(
      {
        state: authRequest.state,
        nonce: authRequest.nonce,
        verifier: authRequest.codeVerifier,
        returnTo,
      },
      TX_MAX_AGE,
    );
    return redirect(authRequest.url, [
      cookie(request, txCookie, tx, TX_MAX_AGE),
    ]);
  }

  /** GET /auth/callback → exchanges the code, sets the session cookie, redirects. */
  async function callback(request: Request): Promise<Response> {
    const clearTx = cookie(request, txCookie, "", 0);
    const tx = await unseal<{
      state: string;
      nonce: string;
      verifier: string;
      returnTo: string;
    }>(cookieValue(request, txCookie));
    const fail = (code: string) => {
      const target = new URL(errorPath, "http://placeholder.invalid");
      target.searchParams.set("error", code);
      return redirect(`${target.pathname}${target.search}`, [clearTx]);
    };
    if (!tx) return fail("login_expired");
    try {
      const { code } = options.auth.parseCallback(new URL(request.url), {
        state: tx.state,
      });
      const result = await options.auth.exchangeCode({
        code,
        codeVerifier: tx.verifier,
        nonce: tx.nonce,
      });
      if (!result.claims) return fail("invalid_token");
      const session: MiRotaractSession = {
        user: pickUser(result.claims),
        expiresAt: Date.now() + maxAge * 1000,
        ...(options.storeTokens
          ? {
              accessToken: result.accessToken,
              accessTokenExpiresAt: result.expiresAt,
              ...(result.refreshToken
                ? { refreshToken: result.refreshToken }
                : {}),
            }
          : {}),
      };
      const sealed = await seal({ session } as unknown as JWTPayload, maxAge);
      return redirect(safeRelativePath(tx.returnTo, afterLogin), [
        clearTx,
        cookie(request, cookieName, sealed, maxAge),
      ]);
    } catch (error) {
      if (error instanceof MiRotaractOAuthError) return fail(error.error);
      throw error;
    }
  }

  /** POST (recommended) or GET /auth/logout → clears the cookie, revokes the refresh token if stored. */
  async function logout(request: Request): Promise<Response> {
    const session = await getSession(request);
    if (session?.refreshToken)
      await options.auth
        .revoke(session.refreshToken, { tokenTypeHint: "refresh_token" })
        .catch(() => undefined);
    return redirect(afterLogout, [cookie(request, cookieName, "", 0)]);
  }

  /**
   * The current session or null. Accepts a `Request`, `Headers`, a raw
   * Cookie header, or Next's `cookies()` store.
   */
  async function getSession(
    source: CookieSource,
  ): Promise<MiRotaractSession | null> {
    const payload = await unseal<{ session?: MiRotaractSession }>(
      cookieValue(source, cookieName),
    );
    const session = payload?.session;
    if (!session?.user?.sub || session.expiresAt <= Date.now()) return null;
    return session;
  }

  return { login, callback, logout, getSession, cookieName };
}

function pickUser(claims: IdTokenClaims): SessionUser {
  const keys = [
    "sub",
    "name",
    "given_name",
    "family_name",
    "picture",
    "email",
    "email_verified",
    "memberships",
    "positions",
  ] as const;
  const user: Record<string, unknown> = {};
  for (const key of keys)
    if (claims[key] !== undefined) user[key] = claims[key];
  return user as SessionUser;
}

/**
 * Webhook route for the App Router:
 * `export const POST = createWebhookHandler({ secret, onEvent })` in
 * `app/api/webhooks/route.ts`. Same as the package root export.
 */
export { createWebhookHandler } from "./webhooks.ts";
