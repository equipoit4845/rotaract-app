'use client';

import { SESSION_TOKEN_PATH, loginHref } from '@/lib/config';

/**
 * Browser-side holder of the short-lived meetings token (HS256, 15 min)
 * minted by `GET /api/session/token` from the encrypted session cookie.
 * Replaces legacy `localStorage['mi_rotaract_token']`: the token lives in
 * memory only and is refreshed before it expires.
 */

type TokenResponse = { token: string; expiresAt: number };

/** Refresh this long before expiry. */
export const REFRESH_MARGIN_MS = 60_000;

let current: TokenResponse | null = null;
let inflight: Promise<string> | null = null;
const listeners = new Set<(token: string | null) => void>();

export class SessionExpiredError extends Error {
  constructor() {
    super('Tu sesión expiró. Volvé a ingresar.');
    this.name = 'SessionExpiredError';
  }
}

/** True when the cached token must be refreshed at `now`. */
export function isTokenStale(
  token: TokenResponse | null,
  now = Date.now(),
): boolean {
  return !token || token.expiresAt - REFRESH_MARGIN_MS <= now;
}

function redirectToLogin() {
  if (typeof window === 'undefined') return;
  const here = `${window.location.pathname}${window.location.search}`;
  window.location.assign(loginHref(here));
}

async function fetchToken(): Promise<string> {
  const res = await fetch(SESSION_TOKEN_PATH, {
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (res.status === 401) {
    current = null;
    listeners.forEach((l) => l(null));
    redirectToLogin();
    throw new SessionExpiredError();
  }
  if (!res.ok) throw new Error('No se pudo obtener el token de sesión');
  const body = (await res.json()) as TokenResponse;
  current = body;
  listeners.forEach((l) => l(body.token));
  return body.token;
}

/** A valid token, refreshing it if it is missing or about to expire. */
export function getToken(options: { force?: boolean } = {}): Promise<string> {
  if (!options.force && !isTokenStale(current)) {
    return Promise.resolve(current!.token);
  }
  inflight ??= fetchToken().finally(() => {
    inflight = null;
  });
  return inflight;
}

/** The cached token without refreshing (may be stale or null). */
export function getCachedToken(): string | null {
  return current?.token ?? null;
}

/** Epoch ms when the cached token expires, or null. */
export function getCachedTokenExpiry(): number | null {
  return current?.expiresAt ?? null;
}

export function invalidateToken() {
  current = null;
}

export function onTokenChange(listener: (token: string | null) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
