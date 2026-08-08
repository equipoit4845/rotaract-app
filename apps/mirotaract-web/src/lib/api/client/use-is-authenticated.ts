"use client";

import { useSyncExternalStore } from "react";

import { tokenManager } from "./token-manager";

export function useIsAuthenticated(): boolean {
  return useSyncExternalStore(
    tokenManager.subscribe,
    tokenManager.isAuthenticated,
    () => false,
  );
}
