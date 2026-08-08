import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const { tokenManager } = await import("../src/lib/api/client/token-manager.ts");

test("token-manager's public surface never exposes a refresh token getter/setter", () => {
  const surface = Object.keys(tokenManager);
  for (const key of surface) {
    assert.doesNotMatch(
      key.toLowerCase(),
      /refresh/,
      `tokenManager.${key} suggests refresh-token access from browser JS`,
    );
  }
});

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) yield full;
  }
}

test("no client-side module (outside the generated schema and the server-only cookie helper) reads or names a refresh token", async () => {
  const srcDir = new URL("../src", import.meta.url).pathname;
  const offenders = [];
  for await (const file of walk(srcDir)) {
    if (file.endsWith("client/schema.ts")) continue;
    if (file.endsWith("session-cookie.server.ts")) continue; // server-only by design, checked separately
    if (file.endsWith(".server.ts")) continue;
    if (file.includes(`${path.sep}app${path.sep}api${path.sep}auth${path.sep}`))
      continue; // BFF route handlers run server-side only
    const content = await readFile(file, "utf8");
    if (/refreshToken/i.test(content)) offenders.push(file);
  }
  assert.deepEqual(
    offenders,
    [],
    "refreshToken referenced outside server-only auth code",
  );
});

test("session-cookie.server.ts is marked server-only so it can't be imported into a client bundle", async () => {
  const content = await readFile(
    new URL("../src/lib/api/client/session-cookie.server.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    content,
    /^import\s+["']server-only["'];?/m,
    "session-cookie.server.ts should import 'server-only' to hard-fail if a client component ever imports it",
  );
});
