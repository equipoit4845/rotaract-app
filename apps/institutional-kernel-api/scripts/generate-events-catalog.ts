/**
 * Writes docs/developers/catalogo-de-eventos.md from the event catalog
 * (src/application/webhooks/catalog.ts). `--check` exits 1 when the file is
 * stale instead of writing it.
 *
 *   pnpm docs:events            # from the repo root
 *   pnpm docs:events --check
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { renderCatalogMarkdown } from "../src/application/webhooks/catalog-docs";

const target = resolve(
  __dirname,
  "../../../docs/developers/catalogo-de-eventos.md",
);
const rendered = renderCatalogMarkdown();
let current = "";
try {
  current = readFileSync(target, "utf8");
} catch {
  // first run
}
if (process.argv.includes("--check")) {
  if (current !== rendered) {
    console.error(
      "docs/developers/catalogo-de-eventos.md está desactualizado: corré `pnpm docs:events`",
    );
    process.exit(1);
  }
  console.log("Event catalog docs are up to date");
} else {
  writeFileSync(target, rendered);
  console.log(`Wrote ${target}`);
}
