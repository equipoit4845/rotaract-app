import "./bootstrap.ts";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook as rtlRenderHook, waitFor } from "@testing-library/react";
import React, { type ReactNode } from "react";

export { act, waitFor };

export function newQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
}

/** Wraps `@testing-library/react`'s `renderHook` with a fresh QueryClientProvider. */
export function renderHookWithClient<T>(
  hook: () => T,
  { queryClient = newQueryClient() }: { queryClient?: QueryClient } = {},
) {
  const wrapper = ({ children }: { children: ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  const result = rtlRenderHook(hook, { wrapper });
  return { ...result, queryClient };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function problemResponse(
  status: number,
  code: string,
  extra: Record<string, unknown> = {},
): Response {
  return jsonResponse(
    { type: "about:blank", title: code, status, code, instance: "/test", ...extra },
    status,
  );
}
