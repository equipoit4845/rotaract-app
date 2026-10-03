import { randomBytes } from 'crypto';

/**
 * The meetings token: a short-lived HS256 JWT minted by meetings-web
 * (`GET /api/session/token`) for the browser, sent as `Authorization: Bearer`
 * to the REST API and as socket `auth.token`.
 *
 * Claims: { sub: <kernel personId>, name, email, aud: "meetings-api",
 * iss: "meetings-web", exp }. Role claims, if any, are ignored: the role is
 * always resolved from the directory.
 */
const randomDevSecret = randomBytes(48).toString('hex');

export const MEETINGS_TOKEN_AUDIENCE = 'meetings-api';
export const MEETINGS_TOKEN_ISSUER = 'meetings-web';
export const MEETINGS_TOKEN_ALGORITHM = 'HS256' as const;

export type MeetingsTokenPayload = {
  sub: string;
  name?: string;
  email?: string;
  aud?: string | string[];
  iss?: string;
  exp?: number;
};

export function meetingsTokenSecret(): string {
  const secret = process.env.MEETINGS_TOKEN_SECRET ?? '';
  if (secret.length < 32) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('MEETINGS_TOKEN_SECRET must be set (>= 32 chars)');
    }
  }
  // Outside production an unset secret yields a random one, so no token can
  // ever verify by accident.
  return secret || randomDevSecret;
}

export const meetingsTokenVerifyOptions = () => ({
  secret: meetingsTokenSecret(),
  algorithms: [MEETINGS_TOKEN_ALGORITHM],
  audience: MEETINGS_TOKEN_AUDIENCE,
  issuer: MEETINGS_TOKEN_ISSUER,
});
