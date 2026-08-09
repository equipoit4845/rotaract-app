// bootstrap.ts installs jsdom's globals and must run before
// `@testing-library/react`/react-dom ever get imported — see
// organizations.runtime.test.ts for the full explanation.
import "./bootstrap.ts";

import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import { cleanup } from "@testing-library/react";
import React from "react";

import { MockBackend } from "./mock-backend.ts";
import { renderWithRouter, waitFor } from "./render.ts";

afterEach(cleanup);

const { tokenManager } =
  await import("../../src/lib/api/client/token-manager.ts");
const { HomeContainer } =
  await import("../../src/features/home/containers/home-container.tsx");

// This must be the file's first test — it relies on `tokenManager` still
// being at its fresh-process default (`BOOTSTRAPPING`), before any other
// test in this file calls `setSession`/`clearSession` (product spec §46).
test("Home — BOOTSTRAPPING shows only a spinner, no landing/login flash", async () => {
  assert.equal(tokenManager.getAuthStatus(), "BOOTSTRAPPING");

  const { queryByText, getAllByRole, router } = renderWithRouter(
    React.createElement(HomeContainer),
  );

  assert.ok(getAllByRole("status").length > 0);
  assert.equal(queryByText("Ingresar"), null);
  assert.equal(router.replaceCalls.length, 0);
});

test("Home — UNAUTHENTICATED renders the public landing", async () => {
  tokenManager.clearSession();

  const { getByText, getAllByText } = renderWithRouter(
    React.createElement(HomeContainer),
  );

  assert.ok(getAllByText("Mi Rotaract").length > 0);
  assert.ok(getByText("Qué permite administrar"));
  assert.ok(getByText("Cómo funciona el acceso"));
  assert.ok(getAllByText("Ingresar").length > 0);
});

test("Home — the CTA links to /login", async () => {
  tokenManager.clearSession();

  const { getAllByText } = renderWithRouter(React.createElement(HomeContainer));

  const cta = getAllByText("Ingresar").find((el) => el.tagName === "A") as
    HTMLAnchorElement | undefined;
  assert.ok(cta);
  assert.equal(cta!.getAttribute("href"), "/login");
});

test("Home — AUTHENTICATED redirects to /dashboard instead of showing the landing", async () => {
  const backend = new MockBackend();
  tokenManager.setSession(backend.issueToken(), 600);

  const { queryByText, router } = renderWithRouter(
    React.createElement(HomeContainer),
  );

  assert.equal(queryByText("Qué permite administrar"), null);
  await waitFor(() => assert.ok(router.replaceCalls.includes("/dashboard")));
});
