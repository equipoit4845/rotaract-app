import { SignJWT } from "jose";

/**
 * Correo token: short-lived HS256 JWT the browser sends to correo-api
 * (`Authorization: Bearer`). It only says who is signed in; what they may do
 * is asked to the kernel by correo-api.
 *
 * `sub` is the kernel **personId**: the kernel signs the id_token with
 * `subject: grant.personId`, so the session's `user.sub` is already the person.
 */

export const CORREO_TOKEN_AUDIENCE = "correo-api";
export const CORREO_TOKEN_ISSUER = "correo-web";
export const CORREO_TOKEN_TTL_SEC = 15 * 60;

export type CorreoTokenSubject = {
  sub: string;
  name?: string;
};

export type MintedCorreoToken = {
  token: string;
  /** Epoch milliseconds. */
  expiresAt: number;
};

export function assertTokenSecret(
  secret: string | undefined,
): asserts secret is string {
  if (!secret || secret.length < 32) {
    throw new Error("CORREO_TOKEN_SECRET debe tener al menos 32 caracteres");
  }
}

export async function mintCorreoToken(
  user: CorreoTokenSubject,
  secret: string | undefined,
  now: number = Date.now(),
): Promise<MintedCorreoToken> {
  assertTokenSecret(secret);
  if (!user.sub) throw new Error("La sesión no tiene sub (personId)");
  const iat = Math.floor(now / 1000);
  const exp = iat + CORREO_TOKEN_TTL_SEC;
  const token = await new SignJWT(user.name ? { name: user.name } : {})
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.sub)
    .setAudience(CORREO_TOKEN_AUDIENCE)
    .setIssuer(CORREO_TOKEN_ISSUER)
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(new TextEncoder().encode(secret));
  return { token, expiresAt: exp * 1000 };
}
