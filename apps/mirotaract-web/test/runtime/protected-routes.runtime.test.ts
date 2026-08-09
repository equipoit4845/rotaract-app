// bootstrap.ts installs jsdom's globals and must run before
// `@testing-library/react`/react-dom ever get imported — see
// organizations.runtime.test.ts for the full explanation.
import "./bootstrap.ts";

import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import { cleanup, render as rtlRender } from "@testing-library/react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime.js";
import {
  PathnameContext,
  SearchParamsContext,
} from "next/dist/shared/lib/hooks-client-context.shared-runtime.js";
import React from "react";
import type { ReactElement } from "react";

import { MockBackend } from "./mock-backend.ts";
import { renderWithRouter, waitFor } from "./render.ts";

afterEach(cleanup);

/**
 * `renderWithRouter`'s `MockRouter.replace` feeds the target href's query
 * string back into the same `SearchParamsContext` it's rendering under — a
 * fine approximation of same-page navigation (filters, pagination), but
 * wrong for `AuthGate`: its effect derives the redirect target from
 * `pathname`/`searchParams` and *itself* calls `replace`, so that feedback
 * loop never terminates (each pass re-encodes the previous target as the
 * new `next=`). In real Next.js this can't happen — navigating to `/login`
 * unmounts the page `AuthGate` was guarding — so this local render helper
 * mounts the same App Router contexts but with an inert `replace` that only
 * records the call, matching what actually happens once a real navigation
 * takes the guarded route off screen.
 */
function renderAuthGateAt(
  ui: ReactElement,
  { pathname, search }: { pathname: string; search: string },
) {
  const replaceCalls: string[] = [];
  const router = {
    push: () => {},
    replace: (href: string) => {
      replaceCalls.push(href);
    },
    back: () => {},
    forward: () => {},
    refresh: () => {},
    prefetch: () => {},
  };
  const searchParams = new URLSearchParams(search);

  const result = rtlRender(
    React.createElement(
      AppRouterContext.Provider,
      { value: router as never },
      React.createElement(
        SearchParamsContext.Provider,
        { value: searchParams },
        React.createElement(PathnameContext.Provider, { value: pathname }, ui),
      ),
    ),
  );
  return { ...result, replaceCalls };
}

const { tokenManager } =
  await import("../../src/lib/api/client/token-manager.ts");
const { AuthGate } = await import("../../src/features/shell/auth-gate.tsx");
const { KernelApiError } =
  await import("../../src/lib/api/client/api-error.ts");
const { describeKernelError } =
  await import("../../src/features/shell/kernel-error-message.ts");

function ProtectedContent() {
  return React.createElement("div", null, "Contenido protegido");
}

/** Stands in for a feature container that got a 403 mid-session — the
 * error is rendered inline, never routed through `AuthGate`'s redirect. */
function ForbiddenContent() {
  const message = describeKernelError(new KernelApiError({ status: 403 }));
  return React.createElement("div", null, message.title);
}

// This must be the file's first test — it relies on `tokenManager` still
// being at its fresh-process default (`BOOTSTRAPPING`), before any other
// test in this file calls `setSession`/`clearSession`.
test("AuthGate — BOOTSTRAPPING shows only a spinner, no redirect, no protected content", async () => {
  assert.equal(tokenManager.getAuthStatus(), "BOOTSTRAPPING");

  const { queryByText, getAllByRole, router } = renderWithRouter(
    React.createElement(AuthGate, null, React.createElement(ProtectedContent)),
  );

  assert.ok(getAllByRole("status").length > 0);
  assert.equal(queryByText("Contenido protegido"), null);
  assert.equal(router.replaceCalls.length, 0);
});

test("AuthGate — UNAUTHENTICATED (401/expired/never logged in) redirects to /login?next=<ruta actual>", async () => {
  tokenManager.clearSession();

  const { queryByText, replaceCalls } = renderAuthGateAt(
    React.createElement(AuthGate, null, React.createElement(ProtectedContent)),
    { pathname: "/organizations", search: "type=CLUB" },
  );

  assert.equal(queryByText("Contenido protegido"), null);
  await waitFor(() =>
    assert.ok(
      replaceCalls.includes(
        `/login?next=${encodeURIComponent("/organizations?type=CLUB")}`,
      ),
    ),
  );
});

test("AuthGate — AUTHENTICATED renders the protected content, no redirect", async () => {
  const backend = new MockBackend();
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, router } = renderWithRouter(
    React.createElement(AuthGate, null, React.createElement(ProtectedContent)),
  );

  assert.ok(getByText("Contenido protegido"));
  assert.equal(router.replaceCalls.length, 0);
});

test("AuthGate — a 403 inside an authenticated session renders inline, it is never treated as a login redirect (401 ≠ 403)", async () => {
  const backend = new MockBackend();
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByText, router } = renderWithRouter(
    React.createElement(AuthGate, null, React.createElement(ForbiddenContent)),
  );

  await waitFor(() =>
    assert.ok(
      getByText(
        "No tenés permisos para ver esta información en esta organización.",
      ),
    ),
  );
  assert.equal(
    router.replaceCalls.some((c) => c.startsWith("/login")),
    false,
  );
});
