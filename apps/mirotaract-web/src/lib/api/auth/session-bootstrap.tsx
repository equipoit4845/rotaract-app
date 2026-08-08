"use client";

import { useEffect } from "react";

import { refreshManager } from "../client/refresh-manager";

/**
 * Reconstructs the session from the httpOnly refresh cookie on first mount —
 * without this, every page reload or new tab starts with `tokenManager`
 * empty (it's in-memory only by design, see token-manager.ts) and
 * `useCurrentUser()` never fires because it's gated on `isAuthenticated()`.
 * A visitor with no refresh cookie just gets a fast, silent 401 no-op
 * (the /api/auth/refresh route short-circuits before calling the Kernel).
 * Render once, near the root (see providers/query-provider.tsx).
 */
export function SessionBootstrap() {
  useEffect(() => {
    refreshManager.refresh();
  }, []);

  return null;
}
