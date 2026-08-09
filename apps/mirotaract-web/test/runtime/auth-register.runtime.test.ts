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
import {
  jsonResponse,
  problemResponse,
  renderWithRouter,
  waitFor,
} from "./render.ts";

afterEach(cleanup);

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : (input as Request).url;
}

const { tokenManager } =
  await import("../../src/lib/api/client/token-manager.ts");
const { RegisterContainer } =
  await import("../../src/features/auth/containers/register-container.tsx");
const { VerifyEmailContainer } =
  await import("../../src/features/auth/containers/verify-email-container.tsx");

// ---------------------------------------------------------------------------
// /register (product spec §6/§19/§20 — public register only exists because
// kernel-openapi.yaml confirms `POST /auth/register` is a real public
// endpoint; a self-registered account has no Membership until a later
// MembershipApplication, see docs/09).
// ---------------------------------------------------------------------------

test("Register — success shows the verify-email prompt instead of redirecting", async () => {
  tokenManager.clearSession();
  setFetchHandler(async (input) => {
    const url = urlOf(input);
    if (url.endsWith("/auth/register")) {
      return jsonResponse({
        id: "acc_1",
        personId: "per_1",
        email: "ana@example.com",
        accountStatus: "PENDING_VERIFICATION",
      });
    }
    throw new Error(`unexpected call ${url}`);
  });

  const { getByLabelText, getByText } = renderWithRouter(
    React.createElement(RegisterContainer),
  );

  fireEvent.change(getByLabelText("Nombre", { exact: false }), {
    target: { value: "Ana" },
  });
  fireEvent.change(getByLabelText("Apellido", { exact: false }), {
    target: { value: "Gómez" },
  });
  fireEvent.change(getByLabelText("Email", { exact: false }), {
    target: { value: "ana@example.com" },
  });
  fireEvent.change(getByLabelText(/^Contraseña/), {
    target: { value: "correct-password" },
  });
  fireEvent.change(getByLabelText("Confirmar contraseña", { exact: false }), {
    target: { value: "correct-password" },
  });
  fireEvent.click(
    getByText("Crear cuenta", { selector: "button[type=submit]" }),
  );

  await waitFor(() => assert.ok(getByText("Revisá tu email")));
});

test("Register — duplicate email (409) shows a clear message without leaking which field is wrong", async () => {
  tokenManager.clearSession();
  setFetchHandler(async (input) => {
    const url = urlOf(input);
    if (url.endsWith("/auth/register"))
      return problemResponse(409, "ALREADY_EXISTS");
    throw new Error(`unexpected call ${url}`);
  });

  const { getByLabelText, getByText } = renderWithRouter(
    React.createElement(RegisterContainer),
  );

  fireEvent.change(getByLabelText("Nombre", { exact: false }), {
    target: { value: "Ana" },
  });
  fireEvent.change(getByLabelText("Apellido", { exact: false }), {
    target: { value: "Gómez" },
  });
  fireEvent.change(getByLabelText("Email", { exact: false }), {
    target: { value: "ana@example.com" },
  });
  fireEvent.change(getByLabelText(/^Contraseña/), {
    target: { value: "correct-password" },
  });
  fireEvent.change(getByLabelText("Confirmar contraseña", { exact: false }), {
    target: { value: "correct-password" },
  });
  fireEvent.click(
    getByText("Crear cuenta", { selector: "button[type=submit]" }),
  );

  await waitFor(() =>
    assert.ok(getByText("Ya existe una cuenta registrada con ese email.")),
  );
});

test("Register — an already-authenticated visitor is redirected to /dashboard", async () => {
  const backend = new MockBackend();
  tokenManager.setSession(backend.issueToken(), 600);

  const { queryByLabelText, router } = renderWithRouter(
    React.createElement(RegisterContainer),
  );

  assert.equal(queryByLabelText("Email", { exact: false }), null);
  await waitFor(() => assert.ok(router.replaceCalls.includes("/dashboard")));
});

// ---------------------------------------------------------------------------
// /verify-email/[token]
// ---------------------------------------------------------------------------

test("Verify email — valid token shows success and a link to /login", async () => {
  tokenManager.clearSession();
  let calls = 0;
  setFetchHandler(async (input) => {
    const url = urlOf(input);
    if (url.endsWith("/auth/verify-email")) {
      calls += 1;
      return jsonResponse({});
    }
    throw new Error(`unexpected call ${url}`);
  });

  const { getByText } = renderWithRouter(
    React.createElement(VerifyEmailContainer, { token: "tok_valid" }),
  );

  await waitFor(() => assert.ok(getByText("Tu email fue verificado.")));
  assert.equal(calls, 1);
  assert.ok(
    getByText("Ir a ingresar").closest("a")?.getAttribute("href") === "/login",
  );
});

test("Verify email — expired/used token (410) shows a distinct error", async () => {
  tokenManager.clearSession();
  setFetchHandler(async (input) => {
    const url = urlOf(input);
    if (url.endsWith("/auth/verify-email")) return problemResponse(410, "GONE");
    throw new Error(`unexpected call ${url}`);
  });

  const { getByText } = renderWithRouter(
    React.createElement(VerifyEmailContainer, { token: "tok_expired" }),
  );

  await waitFor(() =>
    assert.ok(getByText("Este enlace de verificación ya no es válido.")),
  );
});
