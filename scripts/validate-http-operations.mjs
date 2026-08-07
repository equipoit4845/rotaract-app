import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import SwaggerParser from "@apidevtools/swagger-parser";

const root = new URL("../", import.meta.url).pathname;
const document = await SwaggerParser.parse(join(root, "kernel-openapi.yaml"));
const expected = new Set(Object.entries(document.paths).flatMap(([path, methods]) => Object.keys(methods).filter(method => ["get", "post", "patch", "put", "delete"].includes(method)).map(method => `${method.toUpperCase()} ${path}`)));
const directory = join(root, "apps/institutional-kernel-api/src/interfaces/http");
const files = (await readdir(directory)).filter(name => name.endsWith(".controller.ts"));
const actual = new Set();
for (const file of files) {
  const source = await readFile(join(directory, file), "utf8");
  const prefix = source.match(/@Controller\("?([^"\)]*)"?\)/)?.[1] ?? "";
  for (const match of source.matchAll(/@(Get|Post|Patch|Put|Delete)\(\s*"([^"\n]+)"\s*,?\s*\)/g)) {
    const path = `/${[prefix, match[2]].filter(Boolean).join("/")}`.replace(/\/+/g, "/").replace(/:([A-Za-z0-9_]+)/g, "{$1}");
    actual.add(`${match[1].toUpperCase()} ${path}`);
  }
}
const missing = [...expected].filter(value => !actual.has(value));
if (missing.length) throw new Error(`OpenAPI operations without HTTP adapter: ${missing.join(", ")}`);
console.log(`HTTP adapters cover ${expected.size} OpenAPI operations`);
