#!/usr/bin/env node
/**
 * Builds the Mi Rotaract shadcn registry (official registry-item format,
 * https://ui.shadcn.com/schema/registry-item.json) from the product itself:
 *
 * - the theme is read from apps/mirotaract-web/src/app/globals.css;
 * - the primitives (Button, Badge, Card, Dialog, Table...), the page header,
 *   the empty/error states, the confirmation dialog and the app shell are
 *   the product's own files (apps/mirotaract-web/src/components), with their
 *   imports rewritten for a standalone app;
 * - the status catalog of StatusBadge is the product's
 *   (src/lib/status/status-catalog.ts);
 * - data-table and link are written for the kit (src/), from the same
 *   product pieces.
 *
 * Output: dist/r/registry.json and dist/r/<item>.json.
 *
 *   node scripts/build.mjs [--base-url https://developers.rotaract4845.com/r] [--out dist/r]
 *
 * --base-url is where the JSON files will be served; registryDependencies
 * between items point there.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, "..");
const repoRoot = resolve(packageRoot, "../..");
const web = join(repoRoot, "apps/mirotaract-web/src");

export const DEFAULT_BASE_URL = "https://developers.rotaract4845.com/r";
const ITEM_SCHEMA = "https://ui.shadcn.com/schema/registry-item.json";
const REGISTRY_SCHEMA = "https://ui.shadcn.com/schema/registry.json";
const AUTHOR = "Mi Rotaract — Distrito 4845 <developers@rotaract4845.com>";
/** Where every file lands in the consumer app (relative to its root). */
const TARGET_DIR = "components/mirotaract";

function parseArgs(argv) {
  const args = { baseUrl: DEFAULT_BASE_URL, out: join(packageRoot, "dist/r") };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--base-url") args.baseUrl = argv[++i];
    else if (argv[i] === "--out") args.out = resolve(argv[++i]);
  }
  args.baseUrl = args.baseUrl.replace(/\/+$/, "");
  return args;
}

// --- theme --------------------------------------------------------------

function declarations(block) {
  const vars = {};
  for (const match of block.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g))
    vars[match[1]] = match[2].trim();
  return vars;
}

function cssBlock(css, selector) {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`globals.css has no "${selector}" block`);
  const end = css.indexOf("}", start);
  return css.slice(start, end);
}

/** Tokens shadcn's own theme already maps in @theme inline. */
const SHADCN_THEME_TOKENS = new Set([
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "border",
  "input",
  "ring",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "sidebar",
  "sidebar-foreground",
  "sidebar-primary",
  "sidebar-primary-foreground",
  "sidebar-accent",
  "sidebar-accent-foreground",
  "sidebar-border",
  "sidebar-ring",
]);

export async function themeCssVars() {
  const css = await readFile(join(web, "app/globals.css"), "utf8");
  const light = declarations(cssBlock(css, ":root"));
  const dark = declarations(cssBlock(css, ".dark"));
  const inline = declarations(cssBlock(css, "@theme inline"));
  const theme = {};
  for (const [name, value] of Object.entries(inline)) {
    const token = name.replace(/^color-/, "");
    if (name.startsWith("color-") && !SHADCN_THEME_TOKENS.has(token))
      theme[name] = value; // success, warning, destructive-foreground
    if (name === "radius-2xl") theme[name] = value;
  }
  // The product loads Public Sans with next/font (--font-public-sans); fall
  // back to the system font when the app doesn't.
  theme["font-sans"] =
    "var(--font-public-sans, ui-sans-serif), system-ui, sans-serif";
  return { theme, light, dark };
}

// --- files ----------------------------------------------------------------

/** Product imports → standalone app imports. */
export function rewriteImports(source) {
  return source
    .replace(/from "@\/lib\/cn"/g, 'from "@/lib/utils"')
    .replace(/from "@\/components\/ui"/g, `from "@/${TARGET_DIR}/ui"`)
    .replace(
      /import Link from "next\/link";/g,
      `import { MrLink as Link } from "@/${TARGET_DIR}/link";`,
    );
}

/** npm packages a file imports (not React, not aliases, not relative). */
export function npmDependencies(source) {
  const packages = new Set();
  // Only real import/export statements (never code inside comments).
  for (const match of source.matchAll(
    /^(?:import|export)\s[^;]*?from\s+"([^"]+)"/gm,
  )) {
    const specifier = match[1];
    if (specifier.startsWith(".") || specifier.startsWith("@/")) continue;
    const name = specifier.startsWith("@")
      ? specifier.split("/").slice(0, 2).join("/")
      : specifier.split("/")[0];
    if (["react", "react-dom"].includes(name)) continue;
    packages.add(name);
  }
  return [...packages].sort();
}

/** The product's status catalog object literal, without `satisfies` clauses. */
export async function productStatusCatalog() {
  const source = await readFile(
    join(web, "lib/status/status-catalog.ts"),
    "utf8",
  );
  const start = source.indexOf("const catalog = {");
  const end = source.indexOf("} as const;", start);
  if (start < 0 || end < 0)
    throw new Error(
      "status-catalog.ts: `const catalog = { ... } as const;` not found",
    );
  return source
    .slice(start + "const catalog = ".length, end + 1)
    .replace(/\s*satisfies Record<[^>]+>/g, "");
}

async function productFile(relative) {
  return rewriteImports(await readFile(join(web, relative), "utf8"));
}

async function kitFile(relative) {
  let source = await readFile(join(packageRoot, "src", relative), "utf8");
  if (source.includes("/* @build:status-catalog */ {}"))
    source = source.replace(
      "/* @build:status-catalog */ {}",
      await productStatusCatalog(),
    );
  return source;
}

function file(name, content, type = "registry:component") {
  return {
    path: `registry/mirotaract/${name}`,
    type,
    target: `${TARGET_DIR}/${name}`,
    content,
  };
}

// --- items ----------------------------------------------------------------

export async function buildItems(baseUrl = DEFAULT_BASE_URL) {
  const url = (name) => `${baseUrl}/${name}.json`;
  const ui = await productFile("components/ui/index.tsx");
  const link = await kitFile("link.tsx");
  const items = [
    {
      name: "mirotaract-theme",
      type: "registry:theme",
      title: "Tema de Mi Rotaract",
      description:
        "Colores, radios y tipografía de Mi Rotaract (primario arándano, neutros “mist”, éxito y advertencia), claro y oscuro. Variables CSS para Tailwind v4.",
      cssVars: await themeCssVars(),
      docs: "Tipografía: el producto usa Public Sans. En Next.js cargala con next/font/google y la variable --font-public-sans (ver docs/developers/kit-de-ui.md).",
    },
    {
      name: "mirotaract-ui",
      type: "registry:ui",
      title: "Componentes base de Mi Rotaract",
      description:
        "Los componentes base del producto (Button, Badge, Card, Dialog, Table, Select, Tabs, Alert, Skeleton...) en components/mirotaract/ui.tsx, sin pisar tus components/ui.",
      dependencies: [
        ...new Set([...npmDependencies(ui), ...npmDependencies(link)]),
      ].sort(),
      registryDependencies: ["utils", url("mirotaract-theme")],
      files: [
        file("ui.tsx", ui, "registry:ui"),
        file("link.tsx", link, "registry:ui"),
      ],
    },
    {
      name: "status-badge",
      type: "registry:component",
      title: "Badge de estado",
      description:
        '<StatusBadge kind="membership" status="ACTIVE" />: los estados del kernel con el mismo texto y color que en Mi Rotaract; también estados propios con label y tone.',
      registryDependencies: [url("mirotaract-ui")],
      files: [file("status-badge.tsx", await kitFile("status-badge.tsx"))],
    },
    {
      name: "page-header",
      type: "registry:component",
      title: "Encabezado de página",
      description:
        "PageHeader (título, descripción, acciones y migas de pan), Breadcrumbs y SectionHeader, como en las pantallas de Mi Rotaract.",
      registryDependencies: [url("mirotaract-ui")],
      files: [
        file(
          "page-header.tsx",
          await productFile("components/layout/page-header.tsx"),
        ),
      ],
    },
    {
      name: "empty-state",
      type: "registry:component",
      title: "Estados vacíos y de error",
      description:
        "DataState (vacío, error y cargando, en lenguaje simple), StatCard, DataToolbar y DataPagination.",
      registryDependencies: [url("mirotaract-ui")],
      files: [
        file(
          "data-display.tsx",
          await productFile("components/layout/data-display.tsx"),
        ),
      ],
    },
    {
      name: "confirm-dialog",
      type: "registry:component",
      title: "Diálogo de confirmación",
      description:
        "El diálogo único para confirmar una acción: “Procesando…” mientras espera, error en línea sin cerrarse y variante de peligro.",
      registryDependencies: [url("mirotaract-ui")],
      files: [
        file(
          "confirm-dialog.tsx",
          await productFile("components/layout/confirmation-dialog.tsx"),
        ),
      ],
    },
    {
      name: "data-table",
      type: "registry:component",
      title: "Tabla de datos",
      description:
        "Listados como los de Mi Rotaract: tabla con barra de herramientas, filas de carga, estado vacío o de error y paginación por cursor.",
      registryDependencies: [url("mirotaract-ui"), url("empty-state")],
      files: [file("data-table.tsx", await kitFile("data-table.tsx"))],
    },
    {
      name: "app-shell",
      type: "registry:component",
      title: "Marco de la app (shell)",
      description:
        'El marco de Mi Rotaract: barra lateral con grupos plegables, barra superior fija, menú en el celular y contenido centrado. Incluye el logo oficial de Rotaract Distrito 4845 (<Logo /> completo para la barra lateral, variant="mark" —la rueda— para la barra del celular).',
      registryDependencies: [url("mirotaract-ui")],
      files: [
        file(
          "app-shell.tsx",
          await productFile("components/layout/app-shell.tsx"),
        ),
        file("brand.tsx", await productFile("components/brand.tsx")),
      ],
    },
  ];
  for (const item of items) {
    item.author = AUTHOR;
    item.categories = ["mirotaract"];
    const deps = new Set(item.dependencies ?? []);
    for (const entry of item.files ?? [])
      for (const dep of npmDependencies(entry.content)) deps.add(dep);
    if (deps.size) item.dependencies = [...deps].sort();
  }
  return items;
}

export function registryIndex(items) {
  return {
    $schema: REGISTRY_SCHEMA,
    name: "mirotaract",
    homepage: "https://developers.rotaract4845.com",
    items: items.map(({ files, ...item }) => ({
      ...item,
      ...(files
        ? { files: files.map(({ content: _content, ...entry }) => entry) }
        : {}),
    })),
  };
}

export async function build({ baseUrl = DEFAULT_BASE_URL, out } = {}) {
  const outDir = out ?? join(packageRoot, "dist/r");
  const items = await buildItems(baseUrl);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  for (const item of items)
    await writeFile(
      join(outDir, `${item.name}.json`),
      `${JSON.stringify({ $schema: ITEM_SCHEMA, ...item }, null, 2)}\n`,
    );
  await writeFile(
    join(outDir, "registry.json"),
    `${JSON.stringify(registryIndex(items), null, 2)}\n`,
  );
  return { outDir, items };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = parseArgs(process.argv.slice(2));
  const { outDir, items } = await build(args);
  console.log(
    `Registro shadcn de Mi Rotaract: ${items.length} ítems en ${outDir} (base ${args.baseUrl})`,
  );
}
