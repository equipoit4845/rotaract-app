import "server-only";

import { MiRotaract, MiRotaractAuth } from "@mirotaract/sdk";
import { createMiRotaractNext } from "@mirotaract/sdk/next";

/**
 * Todo lo de Mi Rotaract vive en el SERVIDOR (`server-only` rompe el build si
 * algún componente de cliente lo importa): el secreto y los tokens nunca
 * llegan al navegador. La sesión es una cookie httpOnly cifrada.
 */

function env(name: string): string {
  const value = process.env[name];
  if (!value)
    throw new Error(
      `Falta la variable ${name}. Corré \`mirotaract dev up\` (kernel local) o completá .env.local a partir de .env.example.`,
    );
  return value;
}

/** Datos que pedimos a la persona al ingresar. Pedí solo lo que uses. */
export const LOGIN_SCOPE = "openid profile email memberships";

let auth: MiRotaractAuth | undefined;
let session: ReturnType<typeof createMiRotaractNext> | undefined;
let data: MiRotaract | undefined;

/** "Ingresar con Mi Rotaract": OIDC authorization code + PKCE. */
export function miRotaractAuth(): MiRotaractAuth {
  return (auth ??= new MiRotaractAuth({
    issuer: env("MIROTARACT_ISSUER"),
    clientId: env("MIROTARACT_CLIENT_ID"),
    clientSecret: env("MIROTARACT_CLIENT_SECRET"),
    redirectUri: `${env("APP_URL")}/auth/callback`,
    scope: LOGIN_SCOPE,
  }));
}

/** Route handlers de login/callback/logout y lectura de la sesión. */
export function miRotaractSession() {
  return (session ??= createMiRotaractNext({
    auth: miRotaractAuth(),
    secret: env("SESSION_SECRET"),
    scope: LOGIN_SCOPE,
    sessionMaxAgeSec: 8 * 60 * 60,
    errorPath: "/",
  }));
}

/**
 * API de datos con el token de servicio de la app (client_credentials).
 * Ve TODA la organización de la app (un distrito ve todos sus clubes): la
 * regla de quién puede ver qué la aplica esta app, ver `lib/clubs.ts`.
 */
export function miRotaractData(): MiRotaract {
  return (data ??= new MiRotaract({
    baseUrl: env("MIROTARACT_BASE_URL"),
    clientId: env("MIROTARACT_CLIENT_ID"),
    clientSecret: env("MIROTARACT_CLIENT_SECRET"),
  }));
}

let mobileAuth: MiRotaractAuth | undefined;

/**
 * Verificador de access tokens emitidos a TU app móvil/SPA (PUBLIC). Rechaza
 * tokens de otras apps (`client_id` distinto), así nadie te reenvía un token
 * que obtuvo para otra cosa. Sin MIROTARACT_PUBLIC_CLIENT_ID, /api/members
 * queda deshabilitado.
 */
export function mobileTokenVerifier(): MiRotaractAuth | null {
  const clientId = process.env.MIROTARACT_PUBLIC_CLIENT_ID;
  if (!clientId) return null;
  return (mobileAuth ??= new MiRotaractAuth({
    issuer: env("MIROTARACT_ISSUER"),
    clientId,
    // No se usa: esta instancia solo verifica tokens.
    redirectUri: `${env("APP_URL")}/auth/callback`,
  }));
}
