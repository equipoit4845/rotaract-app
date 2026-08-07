import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the initial page identifies the institutional platform", async () => {
  const page = await readFile(
    new URL("../src/app/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(page, /Mi Rotaract/);
});
