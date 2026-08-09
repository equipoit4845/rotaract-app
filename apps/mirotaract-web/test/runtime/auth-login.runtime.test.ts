// bootstrap.ts installs jsdom's globals and must run before
// `@testing-library/react`/react-dom ever get imported — see
// organizations.runtime.test.ts for the full explanation.
import "./bootstrap.ts";

import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import { cleanup, fireEvent } from "@testing-library/react";
import React from "react";

import { setFetchHandler } from "./bootstrap.ts";
import { MockBackend } from "./mock-backend.ts";
import { problemResponse, renderWithRouter, waitFor } from "./render.ts";

afterEach(cleanup);

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : (input as Request).url;
}

const { tokenManager } =
  await import("../../src/lib/api/client/token-manager.ts");
const { LoginContainer } =
  await import("../../src/features/auth/containers/login-container.tsx");

type LabelQuery = (label: string, options?: { exact?: boolean }) => HTMLElement;

function fillLoginForm(
  getByLabelText: LabelQuery,
  email: string,
  password: string,
) {
  fireEvent.change(getByLabelText("Email", { exact: false }), {
    target: { value: email },
  });
  fireEvent.change(getByLabelText("Contraseña", { exact: false }), {
    target: { value: password },
  });
}

// This must be the file's first test — it relies on `tokenManager` still
// being at its fresh-process default (`BOOTSTRAPPING`), before any other
// test in this file calls `setSession`/`clearSession` (product spec §41).
test("Login — BOOTSTRAPPING renders only a spinner, never the form or a redirect", async () => {
  assert.equal(tokenManager.getAuthStatus(), "BOOTSTRAPPING");

  const { queryByLabelText, getAllByRole, router } = renderWithRouter(
    React.createElement(LoginContainer),
  );

  assert.ok(getAllByRole("status").length > 0);
  assert.equal(queryByLabelText("Email", { exact: false }), null);
  assert.equal(router.replaceCalls.length, 0);
});

test("Login — success redirects to /dashboard by default", async () => {
  const backend = new MockBackend();
  tokenManager.clearSession();

  const { getByLabelText, getByText, router } = renderWithRouter(
    React.createElement(LoginContainer),
  );

  fillLoginForm(getByLabelText, "ana@example.com", "correct-password");
  fireEvent.click(getByText("Ingresar", { selector: "button[type=submit]" }));

  await waitFor(() => assert.equal(backend.loginCalls, 1));
  await waitFor(() => assert.ok(router.replaceCalls.includes("/dashboard")));
});

test("Login — invalid credentials (401) shows a generic message, no account-existence detail", async () => {
  tokenManager.clearSession();
  setFetchHandler(async (input) => {
    const url = urlOf(input);
    if (url.endsWith("/api/auth/login"))
      return problemResponse(401, "UNAUTHORIZED");
    throw new Error(`unexpected call ${url}`);
  });

  const { getByLabelText, getByText } = renderWithRouter(
    React.createElement(LoginContainer),
  );
  fillLoginForm(getByLabelText, "ana@example.com", "wrong-password");
  fireEvent.click(getByText("Ingresar", { selector: "button[type=submit]" }));

  await waitFor(() =>
    assert.ok(getByText("Las credenciales ingresadas no son válidas.")),
  );
});

test("Login — locked account (423) shows a locked-account message", async () => {
  tokenManager.clearSession();
  setFetchHandler(async (input) => {
    const url = urlOf(input);
    if (url.endsWith("/api/auth/login"))
      return problemResponse(423, "ACCOUNT_LOCKED");
    throw new Error(`unexpected call ${url}`);
  });

  const { getByLabelText, getByText } = renderWithRouter(
    React.createElement(LoginContainer),
  );
  fillLoginForm(getByLabelText, "ana@example.com", "x");
  fireEvent.click(getByText("Ingresar", { selector: "button[type=submit]" }));

  await waitFor(() =>
    assert.ok(getByText("Esta cuenta está bloqueada por intentos fallidos.")),
  );
});

test("Login — rate limited (429) shows a rate-limit message", async () => {
  tokenManager.clearSession();
  setFetchHandler(async (input) => {
    const url = urlOf(input);
    if (url.endsWith("/api/auth/login"))
      return problemResponse(429, "RATE_LIMITED");
    throw new Error(`unexpected call ${url}`);
  });

  const { getByLabelText, getByText } = renderWithRouter(
    React.createElement(LoginContainer),
  );
  fillLoginForm(getByLabelText, "ana@example.com", "x");
  fireEvent.click(getByText("Ingresar", { selector: "button[type=submit]" }));

  await waitFor(() =>
    assert.ok(getByText("Demasiados intentos. Intentá nuevamente más tarde.")),
  );
});

test("Login — network failure shows a generic error, no automatic retry", async () => {
  tokenManager.clearSession();
  let loginAttempts = 0;
  setFetchHandler(async (input) => {
    const url = urlOf(input);
    if (url.endsWith("/api/auth/login")) {
      loginAttempts += 1;
      throw new TypeError("network error");
    }
    throw new Error(`unexpected call ${url}`);
  });

  const { getByLabelText, getByText } = renderWithRouter(
    React.createElement(LoginContainer),
  );
  fillLoginForm(getByLabelText, "ana@example.com", "x");
  fireEvent.click(getByText("Ingresar", { selector: "button[type=submit]" }));

  await waitFor(() => assert.ok(getByText("Ocurrió un error inesperado.")));
  // Give any accidental auto-retry a moment to fire before asserting it didn't.
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(loginAttempts, 1);
});

test("Login — safe `next` redirects there after success", async () => {
  const backend = new MockBackend();
  tokenManager.clearSession();

  const { getByLabelText, getByText, router } = renderWithRouter(
    React.createElement(LoginContainer),
    { initialSearchParams: new URLSearchParams("next=/organizations") },
  );

  fillLoginForm(getByLabelText, "ana@example.com", "correct-password");
  fireEvent.click(getByText("Ingresar", { selector: "button[type=submit]" }));

  await waitFor(() => assert.equal(backend.loginCalls, 1));
  await waitFor(() =>
    assert.ok(router.replaceCalls.includes("/organizations")),
  );
});

test("Login — external `next` is rejected, falls back to /dashboard", async () => {
  const backend = new MockBackend();
  tokenManager.clearSession();

  const { getByLabelText, getByText, router } = renderWithRouter(
    React.createElement(LoginContainer),
    {
      initialSearchParams: new URLSearchParams(
        `next=${encodeURIComponent("https://evil.com")}`,
      ),
    },
  );

  fillLoginForm(getByLabelText, "ana@example.com", "correct-password");
  fireEvent.click(getByText("Ingresar", { selector: "button[type=submit]" }));

  await waitFor(() => assert.equal(backend.loginCalls, 1));
  await waitFor(() => assert.ok(router.replaceCalls.includes("/dashboard")));
  assert.equal(
    router.replaceCalls.some((c) => c.includes("evil.com")),
    false,
  );
});

test("Login — backslash-prefixed `next` is rejected too (WHATWG treats `\\` as `/` for special schemes, a known //evil.com bypass), falls back to /dashboard", async () => {
  const backend = new MockBackend();
  tokenManager.clearSession();

  const { getByLabelText, getByText, router } = renderWithRouter(
    React.createElement(LoginContainer),
    {
      initialSearchParams: new URLSearchParams(
        `next=${encodeURIComponent("/\\evil.com")}`,
      ),
    },
  );

  fillLoginForm(getByLabelText, "ana@example.com", "correct-password");
  fireEvent.click(getByText("Ingresar", { selector: "button[type=submit]" }));

  await waitFor(() => assert.equal(backend.loginCalls, 1));
  await waitFor(() => assert.ok(router.replaceCalls.includes("/dashboard")));
  assert.equal(
    router.replaceCalls.some((c) => c.includes("evil.com")),
    false,
  );
});

test("Login — an already-authenticated visitor is redirected away without seeing the form", async () => {
  const backend = new MockBackend();
  tokenManager.setSession(backend.issueToken(), 600);

  const { queryByLabelText, router } = renderWithRouter(
    React.createElement(LoginContainer),
  );

  assert.equal(queryByLabelText("Email"), null);
  await waitFor(() => assert.ok(router.replaceCalls.includes("/dashboard")));
});
