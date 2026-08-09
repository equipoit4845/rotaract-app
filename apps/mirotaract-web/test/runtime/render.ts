import "./bootstrap.ts";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  render as rtlRender,
  renderHook as rtlRenderHook,
  waitFor,
} from "@testing-library/react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime.js";
import {
  PathnameContext,
  SearchParamsContext,
} from "next/dist/shared/lib/hooks-client-context.shared-runtime.js";
import React, { type ReactElement, type ReactNode } from "react";

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

/** Same wrapper as `renderHookWithClient`, for a full component tree instead of a bare hook. */
export function renderWithClient(
  ui: ReactElement,
  { queryClient = newQueryClient() }: { queryClient?: QueryClient } = {},
) {
  const wrapper = ({ children }: { children: ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  const result = rtlRender(ui, { wrapper });
  return { ...result, queryClient };
}

export type MockRouter = {
  push: (href: string) => void;
  replace: (href: string) => void;
  back: () => void;
  forward: () => void;
  refresh: () => void;
  prefetch: () => void;
  pushCalls: string[];
  replaceCalls: string[];
};

/**
 * Wraps `renderWithClient` with the App Router contexts `useRouter()` /
 * `useSearchParams()` / `usePathname()` read from
 * (`next/dist/shared/lib/*.shared-runtime` — the same modules Next's own
 * client hooks import, no test-only shim). There's no real Next.js router
 * mounted under `node --test`, so components that call these hooks need
 * this instead of `renderWithClient`.
 *
 * `push`/`replace` genuinely update the `SearchParamsContext` value (parsed
 * from the target href's query string) and re-render, so a component that
 * calls `router.replace("/x?type=CLUB")` and reads `useSearchParams()`
 * elsewhere in the same tree sees the change — the same round-trip a real
 * browser navigation would produce, not just a recorded call.
 */
export function renderWithRouter(
  ui: ReactElement,
  {
    queryClient = newQueryClient(),
    initialSearchParams = new URLSearchParams(),
    pathname = "/",
  }: {
    queryClient?: QueryClient;
    initialSearchParams?: URLSearchParams;
    pathname?: string;
  } = {},
) {
  let latestRouter!: MockRouter;

  function Wrapper({ children }: { children: ReactNode }) {
    const [searchParams, setSearchParams] = React.useState(initialSearchParams);
    const router = React.useMemo<MockRouter>(() => {
      const pushCalls: string[] = [];
      const replaceCalls: string[] = [];
      function navigate(href: string) {
        const queryString = href.split("?")[1] ?? "";
        setSearchParams(new URLSearchParams(queryString));
      }
      return {
        push: (href) => {
          pushCalls.push(href);
          navigate(href);
        },
        replace: (href) => {
          replaceCalls.push(href);
          navigate(href);
        },
        back: () => {},
        forward: () => {},
        refresh: () => {},
        prefetch: () => {},
        pushCalls,
        replaceCalls,
      };
    }, []);

    latestRouter = router;

    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(
        AppRouterContext.Provider,
        { value: router as never },
        React.createElement(
          SearchParamsContext.Provider,
          { value: searchParams },
          React.createElement(
            PathnameContext.Provider,
            { value: pathname },
            children,
          ),
        ),
      ),
    );
  }

  const result = rtlRender(ui, { wrapper: Wrapper });
  return {
    ...result,
    queryClient,
    get router() {
      return latestRouter;
    },
  };
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
    {
      type: "about:blank",
      title: code,
      status,
      code,
      instance: "/test",
      ...extra,
    },
    status,
  );
}
