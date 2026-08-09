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

const { InviteAcceptContainer } =
  await import("../../src/features/auth/containers/invite-accept-container.tsx");

/**
 * No `GET`-by-token preview endpoint exists (`AccountInvitation` never
 * carries the raw token, `invitePersonToCreateAccount`'s response doesn't
 * return one) — documented `BLOCKED_API` in docs/09. These tests only cover
 * what the direct token+password submission can exercise.
 */

test("Invite accept — valid token creates the account and shows a success state with a login link", async () => {
  let acceptedBody: unknown;
  setFetchHandler(async (input, init) => {
    const url = urlOf(input);
    if (url.endsWith("/auth/invitations/accept")) {
      const request = await asRequest(input as string | Request, init);
      acceptedBody = await request.json();
      return jsonResponse({ id: "acc_1", email: "invited@example.com" });
    }
    throw new Error(`unexpected call ${url}`);
  });

  const { getByLabelText, getByText } = renderWithRouter(
    React.createElement(InviteAcceptContainer, { token: "tok_valid" }),
  );

  fireEvent.change(getByLabelText(/^Contraseña/), {
    target: { value: "correct-password-123" },
  });
  fireEvent.change(getByLabelText("Confirmar contraseña", { exact: false }), {
    target: { value: "correct-password-123" },
  });
  fireEvent.click(
    getByText("Crear cuenta", { selector: "button[type=submit]" }),
  );

  await waitFor(() => assert.ok(getByText("Tu cuenta fue creada.")));
  assert.equal(
    getByText("Ir a ingresar").closest("a")?.getAttribute("href"),
    "/login",
  );
  assert.deepEqual(acceptedBody, {
    token: "tok_valid",
    password: "correct-password-123",
  });
});

test("Invite accept — already-consumed/revoked/expired token (409) shows one honest generic message", async () => {
  setFetchHandler(async (input) => {
    const url = urlOf(input);
    if (url.endsWith("/auth/invitations/accept")) {
      return problemResponse(409, "INVITATION_UNAVAILABLE");
    }
    throw new Error(`unexpected call ${url}`);
  });

  const { getByLabelText, getByText } = renderWithRouter(
    React.createElement(InviteAcceptContainer, { token: "tok_used" }),
  );

  fireEvent.change(getByLabelText(/^Contraseña/), {
    target: { value: "correct-password-123" },
  });
  fireEvent.change(getByLabelText("Confirmar contraseña", { exact: false }), {
    target: { value: "correct-password-123" },
  });
  fireEvent.click(
    getByText("Crear cuenta", { selector: "button[type=submit]" }),
  );

  await waitFor(() =>
    assert.ok(getByText("Esta invitación ya no está disponible.")),
  );
});

test("Invite accept — mismatched password confirmation blocks submit client-side, no request fires", async () => {
  let acceptCalls = 0;
  setFetchHandler(async (input) => {
    const url = urlOf(input);
    if (url.endsWith("/auth/invitations/accept")) {
      acceptCalls += 1;
      return jsonResponse({});
    }
    throw new Error(`unexpected call ${url}`);
  });

  const { getByLabelText, getByText } = renderWithRouter(
    React.createElement(InviteAcceptContainer, { token: "tok_valid" }),
  );

  fireEvent.change(getByLabelText(/^Contraseña/), {
    target: { value: "correct-password-123" },
  });
  fireEvent.change(getByLabelText("Confirmar contraseña", { exact: false }), {
    target: { value: "does-not-match" },
  });
  fireEvent.click(
    getByText("Crear cuenta", { selector: "button[type=submit]" }),
  );

  await waitFor(() => assert.ok(getByText("Las contraseñas no coinciden.")));
  assert.equal(acceptCalls, 0);
});

test("Invite accept — the token never lands in localStorage/sessionStorage before or after submit", async () => {
  setFetchHandler(async (input) => {
    const url = urlOf(input);
    if (url.endsWith("/auth/invitations/accept")) {
      return jsonResponse({ id: "acc_1", email: "invited@example.com" });
    }
    throw new Error(`unexpected call ${url}`);
  });

  const { getByLabelText, getByText } = renderWithRouter(
    React.createElement(InviteAcceptContainer, { token: "tok_secret" }),
  );

  fireEvent.change(getByLabelText(/^Contraseña/), {
    target: { value: "correct-password-123" },
  });
  fireEvent.change(getByLabelText("Confirmar contraseña", { exact: false }), {
    target: { value: "correct-password-123" },
  });
  fireEvent.click(
    getByText("Crear cuenta", { selector: "button[type=submit]" }),
  );

  await waitFor(() => assert.ok(getByText("Tu cuenta fue creada.")));

  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)!;
    assert.equal(
      localStorage.getItem(key)?.includes("tok_secret"),
      false,
      `localStorage[${key}] must not contain the invitation token`,
    );
  }
  for (let i = 0; i < sessionStorage.length; i += 1) {
    const key = sessionStorage.key(i)!;
    assert.equal(
      sessionStorage.getItem(key)?.includes("tok_secret"),
      false,
      `sessionStorage[${key}] must not contain the invitation token`,
    );
  }
});
