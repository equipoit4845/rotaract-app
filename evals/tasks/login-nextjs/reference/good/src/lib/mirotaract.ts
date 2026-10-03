import "server-only";

import { MiRotaractAuth } from "@mirotaract/sdk";
import { createMiRotaractNext } from "@mirotaract/sdk/next";

/** Lo que usamos: nombre (profile) y clubes (memberships). */
export const LOGIN_SCOPE = "openid profile memberships";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable ${name}`);
  return value;
}

let instance: ReturnType<typeof createMiRotaractNext> | undefined;

export function mr() {
  return (instance ??= createMiRotaractNext({
    auth: new MiRotaractAuth({
      issuer: env("MIROTARACT_ISSUER"),
      clientId: env("MIROTARACT_CLIENT_ID"),
      clientSecret: env("MIROTARACT_CLIENT_SECRET"),
      redirectUri: `${env("APP_URL")}/auth/callback`,
      scope: LOGIN_SCOPE,
    }),
    secret: env("SESSION_SECRET"),
    scope: LOGIN_SCOPE,
    sessionMaxAgeSec: 8 * 60 * 60,
  }));
}
