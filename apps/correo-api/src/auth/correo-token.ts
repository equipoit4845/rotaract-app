import { randomBytes } from 'crypto';

/**
 * The correo token: a short-lived HS256 JWT minted by correo-web
 * (`GET /api/session/token`) for the browser, sent as `Authorization: Bearer`.
 *
 * Claims: { sub: <kernel personId>, name, aud: "correo-api",
 * iss: "correo-web", exp }. What the person may do is never read from the
 * token: it is asked to the kernel (`correo.mailbox.*` permissions).
 */
const randomDevSecret = randomBytes(48).toString('hex');

export const CORREO_TOKEN_AUDIENCE = 'correo-api';
export const CORREO_TOKEN_ISSUER = 'correo-web';
export const CORREO_TOKEN_ALGORITHM = 'HS256' as const;

export type CorreoTokenPayload = {
  sub: string;
  name?: string;
  aud?: string | string[];
  iss?: string;
  exp?: number;
};

export function correoTokenSecret(): string {
  const secret = process.env.CORREO_TOKEN_SECRET ?? '';
  if (secret.length < 32) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('CORREO_TOKEN_SECRET must be set (>= 32 chars)');
    }
  }
  // Outside production an unset secret yields a random one, so no token can
  // ever verify by accident.
  return secret || randomDevSecret;
}
