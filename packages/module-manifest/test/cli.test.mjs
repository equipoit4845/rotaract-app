import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { main } from "../bin/mirotaract-module.js";

const example = fileURLToPath(
  new URL("../examples/reuniones/mirotaract.module.json", import.meta.url),
);

function capture() {
  const out = { stdout: "", stderr: "" };
  return {
    out,
    io: {
      stdout: { write: (text) => (out.stdout += text) },
      stderr: { write: (text) => (out.stderr += text) },
    },
  };
}

test("check exits 0 on a valid manifest", async () => {
  const { out, io } = capture();
  assert.equal(await main(["check", example], io), 0);
  assert.match(out.stdout, /manifiesto válido \(reuniones@1\.0\.0, 6 permisos\)/);
});

test("check --json prints { ok, errors } and exits 1 on errors", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mr-manifest-"));
  const file = join(dir, "mirotaract.module.json");
  writeFileSync(
    file,
    JSON.stringify({
      id: "reuniones",
      name: "Reuniones",
      version: "1.0.0",
      contractVersion: 1,
      permissions: [{ code: "kernel.person.manage", name: "Gestionar personas" }],
    }),
  );
  const { out, io } = capture();
  assert.equal(await main(["check", file, "--json"], io), 1);
  const parsed = JSON.parse(out.stdout);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.errors[0].path, "permissions[0].code");
});

test("check exits 2 when the file is missing", async () => {
  const { out, io } = capture();
  assert.equal(await main(["check", "/nonexistent/mirotaract.module.json"], io), 2);
  assert.match(out.stderr, /No encontré/);
});

test("check --events verifies subscriptions against a catalog file", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mr-catalog-"));
  const catalog = join(dir, "catalog.json");
  writeFileSync(catalog, JSON.stringify({ events: [{ type: "membership.activated.v1" }] }));
  const { out, io } = capture();
  assert.equal(await main(["check", example, "--events", catalog], io), 1);
  assert.match(out.stderr, /appointment\.activated\.v1» no existe en el catálogo/);
});
