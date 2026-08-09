// bootstrap.ts installs jsdom's globals and must run before
// `@testing-library/react`/react-dom ever get imported — see
// organizations.runtime.test.ts for the full explanation.
import "./bootstrap.ts";

import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import { cleanup, fireEvent } from "@testing-library/react";
import React from "react";

import { MockBackend } from "./mock-backend.ts";
import { renderWithRouter, waitFor } from "./render.ts";

afterEach(cleanup);

const { tokenManager } =
  await import("../../src/lib/api/client/token-manager.ts");
const { AccountMenu } =
  await import("../../src/features/shell/account-menu.tsx");

/**
 * Radix's `DropdownMenuTrigger` opens on `onPointerDown` (see
 * `@radix-ui/react-dropdown-menu`'s `DropdownMenuTrigger`), not `onClick` —
 * a plain `fireEvent.click` never opens the portal-rendered content.
 */
function openAccountMenu(trigger: HTMLElement) {
  fireEvent.pointerDown(trigger, { button: 0 });
}

test("Logout — clears the token/session and the query cache, then goes to the public home", async () => {
  const backend = new MockBackend();
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByLabelText, getByText, queryClient, router } = renderWithRouter(
    React.createElement(AccountMenu, { displayName: "Ana" }),
  );
  queryClient.setQueryData(["probe"], { stale: "user A data" });

  openAccountMenu(getByLabelText("Cuenta de Ana"));
  await waitFor(() => assert.ok(getByText("Cerrar sesión")));
  fireEvent.click(getByText("Cerrar sesión"));

  await waitFor(() => assert.equal(backend.logoutCalls, 1));
  assert.equal(tokenManager.isAuthenticated(), false);
  assert.equal(tokenManager.getAuthStatus(), "UNAUTHENTICATED");
  assert.equal(queryClient.getQueryData(["probe"]), undefined);
  await waitFor(() => assert.ok(router.pushCalls.includes("/")));
});

test("Logout all — requires confirmation, then clears the session the same way as logout", async () => {
  const backend = new MockBackend();
  tokenManager.setSession(backend.issueToken(), 600);

  const { getByLabelText, getByText, getByRole, queryClient, router } =
    renderWithRouter(React.createElement(AccountMenu, { displayName: "Ana" }));
  queryClient.setQueryData(["probe"], { stale: "user A data" });

  openAccountMenu(getByLabelText("Cuenta de Ana"));
  await waitFor(() => assert.ok(getByText("Cerrar todas las sesiones")));
  fireEvent.click(getByText("Cerrar todas las sesiones"));

  const dialog = await waitFor(() => getByRole("dialog"));
  assert.ok(dialog);
  assert.equal(backend.logoutAllCalls, 0, "must not fire before confirming");

  const { within } = await import("@testing-library/react");
  fireEvent.click(within(dialog).getByText("Cerrar todas"));

  await waitFor(() => assert.equal(backend.logoutAllCalls, 1));
  assert.equal(tokenManager.isAuthenticated(), false);
  assert.equal(tokenManager.getAuthStatus(), "UNAUTHENTICATED");
  assert.equal(queryClient.getQueryData(["probe"]), undefined);
  await waitFor(() => assert.ok(router.pushCalls.includes("/")));
});
