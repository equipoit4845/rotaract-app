import assert from "node:assert/strict";
import test from "node:test";

import { MockBackend } from "./mock-backend.ts";
import { renderHookWithClient, waitFor } from "./render.ts";

const { tokenManager } = await import("../../src/lib/api/client/token-manager.ts");
const { usePersons } = await import("../../src/lib/api/persons/persons.hooks.ts");

test("cursor-based pagination requests the returned nextCursor and concatenates pages; changing filters starts a fresh query instead of continuing the old cursor", async () => {
  const backend = new MockBackend();
  const seenCursors: (string | null)[] = [];
  backend.kernelHandler = (request) => {
    const url = new URL(request.url);
    const query = url.searchParams.get("query");
    const cursor = url.searchParams.get("cursor");
    seenCursors.push(cursor);

    if (query === "smith") {
      return new Response(
        JSON.stringify({
          items: [{ id: "smith_1" }],
          pageInfo: { hasMore: false, nextCursor: null },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (!cursor) {
      return new Response(
        JSON.stringify({
          items: [{ id: "p1" }, { id: "p2" }],
          pageInfo: { hasMore: true, nextCursor: "cursor_abc" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (cursor === "cursor_abc") {
      return new Response(
        JSON.stringify({
          items: [{ id: "p3" }],
          pageInfo: { hasMore: false, nextCursor: null },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    throw new Error(`unexpected cursor ${cursor}`);
  };

  tokenManager.setSession(backend.issueToken(), 600);
  const { result, rerender } = renderHookWithClient(({ query }: { query?: string } = {}) =>
    usePersons(query ? { query } : {}),
  );

  await waitFor(() => assert.equal(result.current.isSuccess, true));
  assert.deepEqual(
    result.current.data?.pages.flatMap((p) => p.items?.map((i) => i.id) ?? []),
    ["p1", "p2"],
  );
  assert.equal(result.current.hasNextPage, true);

  await result.current.fetchNextPage();
  await waitFor(() => assert.equal(result.current.data?.pages.length, 2));

  assert.deepEqual(seenCursors, [null, "cursor_abc"], "the second page request must use the nextCursor from the first");
  assert.deepEqual(
    result.current.data?.pages.flatMap((p) => p.items?.map((i) => i.id) ?? []),
    ["p1", "p2", "p3"],
    "pages must concatenate in order",
  );
  assert.equal(result.current.hasNextPage, false);

  // Changing filters must start a brand-new query, not continue from cursor_abc.
  rerender({ query: "smith" });
  await waitFor(() => assert.equal(result.current.data?.pages.length, 1));
  assert.deepEqual(
    result.current.data?.pages.flatMap((p) => p.items?.map((i) => i.id) ?? []),
    ["smith_1"],
  );
  assert.equal(seenCursors.at(-1), null, "a filter change must reset the cursor, not reuse the old one");

  tokenManager.clearSession();
});
