import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  DEFAULT_BASE_URL,
  build,
  npmDependencies,
  rewriteImports,
} from "../scripts/build.mjs";

const REQUIRED = [
  "mirotaract-theme",
  "app-shell",
  "data-table",
  "status-badge",
  "confirm-dialog",
  "empty-state",
  "page-header",
];

const out = mkdtempSync(join(tmpdir(), "mr-registry-"));
const { items } = await build({ out });
const read = (name) => JSON.parse(readFileSync(join(out, name), "utf8"));

test("builds every item of the E8 contract, plus the base components", () => {
  const names = items.map((item) => item.name);
  for (const name of REQUIRED) assert.ok(names.includes(name), name);
  assert.ok(names.includes("mirotaract-ui"));
  const files = readdirSync(out).sort();
  assert.deepEqual(
    files,
    [...names.map((name) => `${name}.json`), "registry.json"].sort(),
  );
});

test("items use the official registry-item format", () => {
  for (const item of items) {
    const json = read(`${item.name}.json`);
    assert.equal(
      json.$schema,
      "https://ui.shadcn.com/schema/registry-item.json",
    );
    assert.match(json.name, /^[a-z][a-z0-9-]*$/);
    assert.match(json.type, /^registry:(theme|ui|component)$/);
    assert.ok(json.title && json.description);
    for (const file of json.files ?? []) {
      assert.ok(
        file.path && file.type && file.content,
        `${item.name}: ${file.path}`,
      );
      assert.match(file.target, /^components\/mirotaract\/[a-z-]+\.tsx$/);
    }
  }
  const index = read("registry.json");
  assert.equal(index.$schema, "https://ui.shadcn.com/schema/registry.json");
  assert.equal(index.name, "mirotaract");
  assert.equal(index.items.length, items.length);
  assert.ok(
    index.items.every((item) => item.files?.every((f) => !f.content) ?? true),
  );
});

test("no product-only import survives in the shipped files", () => {
  for (const item of items)
    for (const file of item.files ?? []) {
      assert.doesNotMatch(file.content, /@\/lib\/cn"/, file.path);
      assert.doesNotMatch(
        file.content,
        /^import[^;]*from "next\/link"/m,
        file.path,
      );
      assert.doesNotMatch(file.content, /from "@\/components\/ui"/, file.path);
      assert.doesNotMatch(file.content, /from "@\/lib\/api"/, file.path);
      assert.doesNotMatch(file.content, /@build:/, file.path);
    }
});

test("every @/components/mirotaract import is shipped by the item or its dependencies", () => {
  const byName = new Map(items.map((item) => [item.name, item]));
  const closure = (item, seen = new Set()) => {
    if (seen.has(item.name)) return seen;
    seen.add(item.name);
    for (const dep of item.registryDependencies ?? []) {
      const name = dep.startsWith("http")
        ? dep
            .split("/")
            .pop()
            .replace(/\.json$/, "")
        : null;
      if (name && byName.has(name)) closure(byName.get(name), seen);
    }
    return seen;
  };
  for (const item of items) {
    const provided = new Set(
      [...closure(item)].flatMap((name) =>
        (byName.get(name).files ?? []).map((f) =>
          f.target
            .replace(/^components\/mirotaract\//, "")
            .replace(/\.tsx$/, ""),
        ),
      ),
    );
    for (const file of item.files ?? [])
      for (const match of file.content.matchAll(
        /from "@\/components\/mirotaract\/([a-z-]+)"/g,
      ))
        assert.ok(provided.has(match[1]), `${item.name} imports ${match[1]}`);
  }
});

test("registry dependencies point at the published base URL", () => {
  for (const item of items)
    for (const dep of item.registryDependencies ?? [])
      if (dep !== "utils")
        assert.ok(dep.startsWith(`${DEFAULT_BASE_URL}/`), dep);
});

test("the theme is the product's: cranberry primary, success and warning tokens, dark mode", () => {
  const theme = read("mirotaract-theme.json").cssVars;
  const css = readFileSync(
    new URL(
      "../../../apps/mirotaract-web/src/app/globals.css",
      import.meta.url,
    ),
    "utf8",
  );
  assert.equal(theme.light.primary, "oklch(0.525 0.223 3.958)");
  assert.ok(css.includes(`--primary: ${theme.light.primary};`));
  assert.ok(theme.dark.primary);
  assert.equal(theme.theme["color-success"], "var(--success)");
  assert.equal(theme.theme["color-warning"], "var(--warning)");
  assert.ok(theme.light.success && theme.dark.warning);
});

test("StatusBadge carries the product's status catalog", async () => {
  const content = read("status-badge.json").files[0].content;
  const product = readFileSync(
    new URL(
      "../../../apps/mirotaract-web/src/lib/status/status-catalog.ts",
      import.meta.url,
    ),
    "utf8",
  );
  for (const match of product.matchAll(
    /(\w+): \{ label: "([^"]+)", tone: "(\w+)" \}/g,
  ))
    assert.ok(
      content.includes(
        `${match[1]}: { label: "${match[2]}", tone: "${match[3]}" }`,
      ),
      match[0],
    );
  assert.doesNotMatch(content, /satisfies Record<(Membership|Period)/);
});

test("import rewriting and dependency detection", () => {
  assert.equal(
    rewriteImports(
      'import Link from "next/link";\nimport { cn } from "@/lib/cn";',
    ),
    'import { MrLink as Link } from "@/components/mirotaract/link";\nimport { cn } from "@/lib/utils";',
  );
  assert.deepEqual(
    npmDependencies(
      'import * as D from "@radix-ui/react-dialog";\nimport { X } from "lucide-react";\nimport React from "react";\n// import x from "next/link";\n * import NextLink from "next/link";',
    ),
    ["@radix-ui/react-dialog", "lucide-react"],
  );
});
