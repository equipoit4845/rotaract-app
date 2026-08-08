"use client";

import { useSyncExternalStore } from "react";

import { tokenManager, type AuthStatus } from "./token-manager";

/**
 * `BOOTSTRAPPING` | `AUTHENTICATED` | `UNAUTHENTICATED` — lets a root layout
 * hold off rendering a login prompt until `session-bootstrap.tsx`'s silent
 * refresh has actually resolved, instead of treating "haven't checked yet"
 * the same as "checked and signed out".
 */
export function useAuthStatus(): AuthStatus {
  return useSyncExternalStore(
    tokenManager.subscribe,
    tokenManager.getAuthStatus,
    () => "BOOTSTRAPPING" as const,
  );
}
