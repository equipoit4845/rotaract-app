import { SignJWT } from "jose";

/**
 * Meetings token (contract §Identity): short-lived HS256 JWT the browser
 * sends to meetings-api (`Authorization: Bearer`, socket `auth.token`).
 *
 * `sub` is the kernel **personId**: the kernel signs the id_token with
 * `subject: grant.personId` (apps/institutional-kernel-api/src/application/
 * oauth/oidc.service.ts), so the session's `user.sub` is already the person.
 */

export const MEETINGS_TOKEN_AUDIENCE = "meetings-api";
export const MEETINGS_TOKEN_ISSUER = "meetings-web";
export const MEETINGS_TOKEN_TTL_SEC = 15 * 60;

export type MeetingsTokenSubject = {
  sub: string;
  name?: string;
  email?: string;
};

export type MintedMeetingsToken = {
  token: string;
  /** Epoch milliseconds. */
  expiresAt: number;
};

export function assertTokenSecret(
  secret: string | undefined,
): asserts secret is string {
  if (!secret || secret.length < 32) {
    throw new Error("MEETINGS_TOKEN_SECRET debe tener al menos 32 caracteres");
  }
}

export async function mintMeetingsToken(
  user: MeetingsTokenSubject,
  secret: string | undefined,
  now: number = Date.now(),
): Promise<MintedMeetingsToken> {
  assertTokenSecret(secret);
  if (!user.sub) throw new Error("La sesión no tiene sub (personId)");
  const iat = Math.floor(now / 1000);
  const exp = iat + MEETINGS_TOKEN_TTL_SEC;
  const token = await new SignJWT({
    ...(user.name ? { name: user.name } : {}),
    ...(user.email ? { email: user.email } : {}),
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.sub)
    .setAudience(MEETINGS_TOKEN_AUDIENCE)
    .setIssuer(MEETINGS_TOKEN_ISSUER)
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(new TextEncoder().encode(secret));
  return { token, expiresAt: exp * 1000 };
}
