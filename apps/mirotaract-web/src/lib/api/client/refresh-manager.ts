import { tokenManager } from "./token-manager";

type RefreshResult = { accessToken: string; expiresIn: number };

let inFlight: Promise<boolean> | null = null;

/**
 * Single-flight session refresh. Concurrent 401s from unrelated requests
 * must all await the same `POST /api/auth/refresh` round trip instead of
 * racing separate refreshes (kernel-openapi.yaml rotates the refresh token
 * on every use, so a second concurrent call would fail with the first
 * already-consumed one).
 */
export const refreshManager = {
  async refresh(): Promise<boolean> {
    if (!inFlight) {
      inFlight = performRefresh().finally(() => {
        inFlight = null;
      });
    }
    return inFlight;
  },
};

async function performRefresh(): Promise<boolean> {
  const epochAtStart = tokenManager.getEpoch();

  // Only act on the token-manager if nothing else changed the session (e.g.
  // logout) while this refresh was in flight — see token-manager's `epoch`.
  const clearIfStillCurrent = () => {
    if (tokenManager.getEpoch() === epochAtStart) tokenManager.clearSession();
  };

  try {
    const response = await fetch("/api/auth/refresh", { method: "POST" });
    if (!response.ok) {
      clearIfStillCurrent();
      return false;
    }
    const body = (await response.json()) as RefreshResult;
    if (tokenManager.getEpoch() !== epochAtStart) return false;
    tokenManager.setSession(body.accessToken, body.expiresIn);
    return true;
  } catch {
    clearIfStillCurrent();
    return false;
  }
}
