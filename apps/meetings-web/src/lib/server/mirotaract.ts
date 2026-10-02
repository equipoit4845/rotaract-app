import { MiRotaractAuth } from "@mirotaract/sdk";
import { createMiRotaractNext } from "@mirotaract/sdk/next";

/**
 * "Ingresar con Mi Rotaract" (CONFIDENTIAL app, OIDC code + PKCE) via the
 * official SDK. Built lazily so `next build` never needs the secrets.
 * Server and middleware only (it holds the client secret).
 */

export const SESSION_COOKIE = "meetings_session";
export const SCOPES = "openid profile email memberships positions";

type MiRotaractNext = ReturnType<typeof createMiRotaractNext>;

let instance: MiRotaractNext | null = null;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

export function getMiRotaract(): MiRotaractNext {
  if (instance) return instance;
  const redirectUri = required("MIROTARACT_REDIRECT_URI");
  instance = createMiRotaractNext({
    auth: new MiRotaractAuth({
      issuer: required("MIROTARACT_ISSUER"),
      clientId: required("MIROTARACT_CLIENT_ID"),
      clientSecret: required("MIROTARACT_CLIENT_SECRET"),
      redirectUri,
      scope: SCOPES,
    }),
    secret: required("SESSION_SECRET"),
    scope: SCOPES,
    cookieName: SESSION_COOKIE,
    afterLoginPath: "/meetings",
    afterLogoutPath: "/",
    errorPath: "/",
    // Behind cloudflared the Node server sees plain http; the public origin
    // (the registered redirect URI) tells whether cookies must be Secure.
    secureCookies: redirectUri.startsWith("https://"),
  });
  return instance;
}
