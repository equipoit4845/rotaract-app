// bootstrap.ts installs jsdom's globals and must run before
// `@testing-library/react`/react-dom ever get imported — see
// organizations.runtime.test.ts for the full explanation.
import "./bootstrap.ts";

import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import { cleanup, fireEvent } from "@testing-library/react";
import React from "react";

import { asRequest, setFetchHandler } from "./bootstrap.ts";
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

const { ForgotPasswordContainer } =
  await import("../../src/features/auth/containers/forgot-password-container.tsx");
const { ResetPasswordContainer } =
  await import("../../src/features/auth/containers/reset-password-container.tsx");

// ---------------------------------------------------------------------------
// /forgot-password — product spec §22: always the same generic response,
// whether or not the email is registered, so account existence is never
// leaked through this form.
// ---------------------------------------------------------------------------

test("Forgot password — shows the generic confirmation regardless of whether the account exists", async () => {
  const requestedEmails: string[] = [];
  setFetchHandler(async (input, init) => {
    const url = urlOf(input);
    if (url.endsWith("/auth/forgot-password")) {
      const body = await (
        await asRequest(input as string | Request, init)
      ).json();
      requestedEmails.push(body.email);
      return new Response(null, { status: 202 });
    }
    throw new Error(`unexpected call ${url}`);
  });

  const { getByLabelText, getByText } = renderWithRouter(
    React.createElement(ForgotPasswordContainer),
  );

  fireEvent.change(getByLabelText("Email", { exact: false }), {
    target: { value: "maybe-registered@example.com" },
  });
  fireEvent.click(
    getByText("Enviar instrucciones", { selector: "button[type=submit]" }),
  );

  await waitFor(() =>
    assert.ok(
      getByText("Si existe una cuenta asociada, recibirás instrucciones."),
    ),
  );
  assert.deepEqual(requestedEmails, ["maybe-registered@example.com"]);
});

test("Forgot password — a real request failure (network/5xx) still shows an error, not the generic success", async () => {
  setFetchHandler(async (input) => {
    const url = urlOf(input);
    if (url.endsWith("/auth/forgot-password"))
      return problemResponse(500, "INTERNAL");
    throw new Error(`unexpected call ${url}`);
  });

  const { getByLabelText, getByText, queryByText } = renderWithRouter(
    React.createElement(ForgotPasswordContainer),
  );

  fireEvent.change(getByLabelText("Email", { exact: false }), {
    target: { value: "ana@example.com" },
  });
  fireEvent.click(
    getByText("Enviar instrucciones", { selector: "button[type=submit]" }),
  );

  await waitFor(() =>
    assert.ok(getByText("Ocurrió un error del lado del servidor.")),
  );
  assert.equal(
    queryByText("Si existe una cuenta asociada, recibirás instrucciones."),
    null,
  );
});

// ---------------------------------------------------------------------------
// /reset-password/[token]
// ---------------------------------------------------------------------------

test("Reset password — valid token + matching passwords redirects to /login on success", async () => {
  let resetBody: { token: string; newPassword: string } | undefined;
  setFetchHandler(async (input, init) => {
    const url = urlOf(input);
    if (url.endsWith("/auth/reset-password")) {
      resetBody = await (
        await asRequest(input as string | Request, init)
      ).json();
      return jsonResponse({});
    }
    throw new Error(`unexpected call ${url}`);
  });

  const { getByLabelText, getByText, router } = renderWithRouter(
    React.createElement(ResetPasswordContainer, { token: "tok_valid" }),
  );

  fireEvent.change(getByLabelText(/^Nueva contraseña/), {
    target: { value: "brand-new-password" },
  });
  fireEvent.change(getByLabelText("Confirmar contraseña", { exact: false }), {
    target: { value: "brand-new-password" },
  });
  fireEvent.click(
    getByText("Actualizar contraseña", { selector: "button[type=submit]" }),
  );

  await waitFor(() => assert.ok(router.replaceCalls.includes("/login")));
  assert.deepEqual(resetBody, {
    token: "tok_valid",
    newPassword: "brand-new-password",
  });
});

test("Reset password — expired/already-used token (410) shows a distinct error", async () => {
  setFetchHandler(async (input) => {
    const url = urlOf(input);
    if (url.endsWith("/auth/reset-password"))
      return problemResponse(410, "GONE");
    throw new Error(`unexpected call ${url}`);
  });

  const { getByLabelText, getByText } = renderWithRouter(
    React.createElement(ResetPasswordContainer, { token: "tok_expired" }),
  );

  fireEvent.change(getByLabelText(/^Nueva contraseña/), {
    target: { value: "brand-new-password" },
  });
  fireEvent.change(getByLabelText("Confirmar contraseña", { exact: false }), {
    target: { value: "brand-new-password" },
  });
  fireEvent.click(
    getByText("Actualizar contraseña", { selector: "button[type=submit]" }),
  );

  await waitFor(() =>
    assert.ok(getByText("Este enlace de recuperación ya no es válido.")),
  );
});

test("Reset password — invalid token (404/other) still shows an error, no silent success", async () => {
  setFetchHandler(async (input) => {
    const url = urlOf(input);
    if (url.endsWith("/auth/reset-password"))
      return problemResponse(404, "NOT_FOUND");
    throw new Error(`unexpected call ${url}`);
  });

  const { getByLabelText, getByText, router } = renderWithRouter(
    React.createElement(ResetPasswordContainer, { token: "tok_bogus" }),
  );

  fireEvent.change(getByLabelText(/^Nueva contraseña/), {
    target: { value: "brand-new-password" },
  });
  fireEvent.change(getByLabelText("Confirmar contraseña", { exact: false }), {
    target: { value: "brand-new-password" },
  });
  fireEvent.click(
    getByText("Actualizar contraseña", { selector: "button[type=submit]" }),
  );

  await waitFor(() => assert.ok(getByText("No encontramos lo que buscabas.")));
  assert.equal(router.replaceCalls.includes("/login"), false);
});

test("Reset password — mismatched confirmation blocks submit client-side, no request fires", async () => {
  let resetCalls = 0;
  setFetchHandler(async (input) => {
    const url = urlOf(input);
    if (url.endsWith("/auth/reset-password")) {
      resetCalls += 1;
      return jsonResponse({});
    }
    throw new Error(`unexpected call ${url}`);
  });

  const { getByLabelText, getByText } = renderWithRouter(
    React.createElement(ResetPasswordContainer, { token: "tok_valid" }),
  );

  fireEvent.change(getByLabelText(/^Nueva contraseña/), {
    target: { value: "brand-new-password" },
  });
  fireEvent.change(getByLabelText("Confirmar contraseña", { exact: false }), {
    target: { value: "does-not-match" },
  });
  fireEvent.click(
    getByText("Actualizar contraseña", { selector: "button[type=submit]" }),
  );

  await waitFor(() => assert.ok(getByText("Las contraseñas no coinciden.")));
  assert.equal(resetCalls, 0);
});
