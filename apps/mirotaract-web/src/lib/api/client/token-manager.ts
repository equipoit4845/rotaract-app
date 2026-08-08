/**
 * Holds the Kernel access token in memory only (kernel-openapi.yaml
 * `bearerAuth`: 10 minute lifetime). The refresh token never reaches this
 * module or any browser storage — it lives in an httpOnly cookie set by the
 * `/api/auth/*` route handlers (see client/README below) and is rotated by
 * refresh-manager through that BFF boundary. Nothing outside this file
 * should read/write a token directly (no scattered `localStorage`).
 */

type SessionListener = () => void;

/**
 * `BOOTSTRAPPING`: the app hasn't yet resolved whether the httpOnly refresh
 * cookie holds a valid session (see auth/session-bootstrap.tsx) — distinct
 * from `UNAUTHENTICATED` so a consumer can wait instead of flashing a login
 * screen before the first check even ran.
 */
export type AuthStatus = "BOOTSTRAPPING" | "AUTHENTICATED" | "UNAUTHENTICATED";

let accessToken: string | null = null;
let expiresAt: number | null = null;
let authStatus: AuthStatus = "BOOTSTRAPPING";
const listeners = new Set<SessionListener>();

/**
 * Bumped on every `setSession`/`clearSession`. Lets an in-flight refresh
 * detect that the session moved on without it (e.g. the user logged out
 * while `POST /api/auth/refresh` was still pending) and discard its result
 * instead of resurrecting a session the user explicitly ended.
 */
let epoch = 0;

export const tokenManager = {
  getAccessToken(): string | null {
    return accessToken;
  },

  /** True once the access token is within 5s of expiry, to pre-empt a 401 round trip. */
  isExpiringSoon(): boolean {
    return expiresAt !== null && Date.now() >= expiresAt - 5_000;
  },

  getEpoch(): number {
    return epoch;
  },

  getAuthStatus(): AuthStatus {
    return authStatus;
  },

  setSession(token: string, expiresInSeconds: number): void {
    accessToken = token;
    expiresAt = Date.now() + expiresInSeconds * 1000;
    authStatus = "AUTHENTICATED";
    epoch += 1;
    notify();
  },

  clearSession(): void {
    accessToken = null;
    expiresAt = null;
    authStatus = "UNAUTHENTICATED";
    epoch += 1;
    notify();
  },

  isAuthenticated(): boolean {
    return accessToken !== null;
  },

  /** Notified on login, logout, and forced session clears (failed refresh). */
  subscribe(listener: SessionListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

function notify(): void {
  for (const listener of listeners) listener();
}
