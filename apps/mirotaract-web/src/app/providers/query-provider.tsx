"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";

import { KernelApiError } from "@/lib/api/client/api-error";
import { tokenManager } from "@/lib/api/client/token-manager";
import { SessionBootstrap } from "@/lib/api/auth/session-bootstrap";

function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (error instanceof KernelApiError) {
    return error.status === 0 || error.status >= 500;
  }
  return true;
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: shouldRetry,
            refetchOnWindowFocus: false,
            staleTime: 30_000,
          },
          mutations: {
            retry: false,
          },
        },
      }),
  );

  // Any transition to UNAUTHENTICATED clears the cache — not just an explicit
  // logout (already handled by useLogout's onSuccess), but also a *silent*
  // session expiry: a background query's 401 that survives the refresh
  // retry also calls tokenManager.clearSession() (see http-client.ts /
  // refresh-manager.ts), and without this, the previous user's data would
  // stay visible in `data` alongside the new error state.
  useEffect(() => {
    return tokenManager.subscribe(() => {
      if (tokenManager.getAuthStatus() === "UNAUTHENTICATED") {
        queryClient.clear();
      }
    });
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <SessionBootstrap />
      {children}
    </QueryClientProvider>
  );
}
