/**
 * Browser-visible configuration. In production everything is same-origin
 * (cloudflared routes `/meetings-api/*` and `/socket.io/*` to meetings-api),
 * so the defaults are empty strings.
 */
const trimSlash = (value: string) => value.replace(/\/+$/, '');

/** Base for REST calls, e.g. `${API_BASE}/meetings/:id` → `/meetings-api/meetings/:id`. */
export const API_BASE = `${trimSlash(process.env.NEXT_PUBLIC_MEETINGS_API_URL ?? '')}/meetings-api`;

/** socket.io server URL; `undefined` = same origin. */
export const SOCKET_URL = process.env.NEXT_PUBLIC_MEETINGS_SOCKET_URL
  ? trimSlash(process.env.NEXT_PUBLIC_MEETINGS_SOCKET_URL)
  : undefined;

/** "Volver a Mi Rotaract". */
export const MIROTARACT_URL = trimSlash(
  process.env.NEXT_PUBLIC_MIROTARACT_URL || 'https://app.rotaract4845.com',
);

/** Next route that mints the meetings token from the session cookie. */
export const SESSION_TOKEN_PATH = '/api/session/token';

export function loginHref(returnTo: string): string {
  return `/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
}
