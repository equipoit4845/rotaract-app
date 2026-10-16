// bootstrap.ts installs jsdom's globals and must run before
// `@testing-library/react`/react-dom ever get imported — see
// organizations.runtime.test.ts for the full explanation.
import "./bootstrap.ts";

import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import { cleanup } from "@testing-library/react";
import React from "react";

import { setFetchHandler } from "./bootstrap.ts";
import { jsonResponse, renderWithRouter, waitFor } from "./render.ts";

afterEach(cleanup);

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : (input as Request).url;
}

const { NoClubState } =
  await import("../../src/features/shell/no-club-state.tsx");

test("No club — a submitted application points to it instead of the club directory", async () => {
  const requested: string[] = [];
  setFetchHandler(async (input) => {
    const url = urlOf(input);
    requested.push(url);
    if (url.includes("/membership-applications"))
      return jsonResponse([
        {
          id: "app_1",
          organizationId: "club_1",
          requesterPersonId: "per_1",
          status: "SUBMITTED",
          createdAt: "2026-10-16T00:00:00.000Z",
          updatedAt: "2026-10-16T00:00:00.000Z",
        },
      ]);
    throw new Error(`unexpected call ${url}`);
  });

  const { getByText } = renderWithRouter(
    React.createElement(NoClubState, { personId: "per_1" }),
  );

  await waitFor(() => assert.ok(getByText("Tu solicitud está en revisión")));
  assert.equal(
    getByText("Ver mi solicitud").closest("a")?.getAttribute("href"),
    "/applications/app_1",
  );
  const query = new URL(requested[0]).searchParams;
  assert.equal(query.get("personId"), "per_1");
  assert.equal(query.get("status"), "SUBMITTED");
});

test("No club — without a pending application it offers the club directory", async () => {
  setFetchHandler(async (input) => {
    const url = urlOf(input);
    if (url.includes("/membership-applications")) return jsonResponse([]);
    throw new Error(`unexpected call ${url}`);
  });

  const { getByText } = renderWithRouter(
    React.createElement(NoClubState, { personId: "per_1" }),
  );

  await waitFor(() =>
    assert.equal(
      getByText("Buscar mi club").closest("a")?.getAttribute("href"),
      "/join-club",
    ),
  );
  assert.ok(getByText("Todavía no pertenecés a un club"));
});
