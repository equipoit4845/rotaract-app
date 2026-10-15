/**
 * Browser-visible configuration. In production everything is same-origin
 * (cloudflared routes `/correo-api/*` to correo-api), so the defaults are
 * empty strings.
 */
const trimSlash = (value: string) => value.replace(/\/+$/, "");

/** Base for REST calls, e.g. `${API_BASE}/me` → `/correo-api/me`. */
export const API_BASE = `${trimSlash(process.env.NEXT_PUBLIC_CORREO_API_URL ?? "")}/correo-api`;

/** "Volver a Mi Rotaract". */
export const MIROTARACT_URL = trimSlash(
  process.env.NEXT_PUBLIC_MIROTARACT_URL || "https://app.rotaract4845.com",
);

/** Next route that mints the correo token from the session cookie. */
export const SESSION_TOKEN_PATH = "/api/session/token";

export function loginHref(returnTo: string): string {
  return `/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
}

/** Reuniones Distritales, in the apps menu. */
export const REUNIONES_URL = trimSlash(
  process.env.NEXT_PUBLIC_REUNIONES_URL || "https://reuniones.rotaract4845.com",
);
