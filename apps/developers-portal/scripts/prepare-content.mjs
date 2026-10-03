#!/usr/bin/env node
/**
 * Build-time content for the developer portal (docs/16-developer-portal.md):
 *
 * - docs/developers/*.md            → src/generated/docs.json + public/docs/<slug>.md
 * - kernel-openapi.yaml             → src/generated/openapi.json + public/openapi.yaml
 * - search index (docs + API)       → public/search-index.json
 * - E8 shadcn registry (optional)   → public/r/*.json + src/generated/registry.json
 * - E10 llms.txt (optional)         → public/llms.txt, public/llms-full.txt
 *
 * The E8/E10 outputs are consumed only through their contract interfaces
 * (packages/registry/dist/r, scripts/build-llms-txt.mjs → dist/llms). When
 * they are not there yet the build continues with a notice.
 *
 * Env (tests): PORTAL_REPO_ROOT, PORTAL_REGISTRY_DIR, PORTAL_LLMS_DIR,
 * PORTAL_PUBLIC_DIR, PORTAL_GENERATED_DIR.
 */
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const portal = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(process.env.PORTAL_REPO_ROOT ?? join(portal, "../.."));
const docsDir = join(root, "docs/developers");
const generated = resolve(
  process.env.PORTAL_GENERATED_DIR ?? join(portal, "src/generated"),
);
const publicDir = resolve(
  process.env.PORTAL_PUBLIC_DIR ?? join(portal, "public"),
);

/** Sidebar groups; pages not listed here (e.g. new E8/E10 guides) go to "Más guías". */
export const GROUPS = [
  {
    title: "Empezar",
    slugs: [
      "introduccion",
      "conceptos",
      "quickstart-nextjs",
      "quickstart-express",
      "quickstart-fastapi",
      "quickstart-flutter",
      "cli",
    ],
  },
  {
    title: "Autenticación",
    slugs: [
      "registrar-una-app",
      "autenticacion-servidor",
      "ingresar-con-mi-rotaract",
    ],
  },
  {
    title: "API y eventos",
    slugs: ["api-de-datos", "errores", "webhooks", "catalogo-de-eventos"],
  },
  {
    title: "Producción",
    slugs: ["seguridad", "deprecaciones", "changelog", "faq"],
  },
  // --- E12 (docs/19-operations-e12.md)
  {
    title: "Operación",
    slugs: ["estado", "sandbox"],
  },
  // --- end E12
];
const OTHER_GROUP = "Más guías";

export function slugFor(file) {
  const base = file.replace(/\.md$/i, "");
  return base === "README" ? "introduccion" : base.toLowerCase();
}

function titleOf(markdown, fallback) {
  const title = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return title ? title.replace(/`/g, "") : fallback;
}

/** First paragraph after the title, as plain text. */
function descriptionOf(markdown) {
  const body = markdown.replace(/^#\s+.+$/m, "");
  const paragraph = body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .find((block) => block && !/^[#>|`\-*<]/.test(block));
  return plain(paragraph ?? "").slice(0, 240);
}

function plain(text) {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*_>#|]/g, " ")
    .replace(/<!--.*?-->/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function headingId(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/[`*_~]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

/** Sections (## / ###) for the page outline and the search index. */
function sectionsOf(markdown) {
  const sections = [];
  let current = { heading: null, id: null, depth: 1, lines: [] };
  let inCode = false;
  for (const line of markdown.split("\n")) {
    if (/^(`{3,})/.test(line)) inCode = !inCode;
    const match = !inCode && line.match(/^(#{2,3})\s+(.+)$/);
    if (match) {
      sections.push(current);
      current = {
        heading: match[2].trim(),
        id: headingId(match[2]),
        depth: match[1].length,
        lines: [],
      };
    } else current.lines.push(line);
  }
  sections.push(current);
  return sections.map((section) => ({
    heading: section.heading,
    id: section.id,
    depth: section.depth,
    text: plain(section.lines.join("\n")),
  }));
}

export function loadDocs() {
  if (!existsSync(docsDir)) return [];
  const files = readdirSync(docsDir).filter((file) => file.endsWith(".md"));
  const order = GROUPS.flatMap((group) => group.slugs);
  return files
    .map((file) => {
      const markdown = readFileSync(join(docsDir, file), "utf8");
      const slug = slugFor(file);
      const group =
        GROUPS.find((candidate) => candidate.slugs.includes(slug))?.title ??
        OTHER_GROUP;
      const sections = sectionsOf(markdown);
      return {
        slug,
        file,
        title: titleOf(markdown, slug),
        description: descriptionOf(markdown),
        group,
        markdown,
        outline: sections
          .filter((section) => section.heading && section.depth === 2)
          .map(({ heading, id }) => ({ heading, id })),
        sections,
      };
    })
    .sort((a, b) => {
      const ai = order.indexOf(a.slug);
      const bi = order.indexOf(b.slug);
      if (ai !== -1 || bi !== -1)
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      return a.title.localeCompare(b.title, "es");
    });
}

function write(file, content) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function prepareDocs() {
  const docs = loadDocs();
  rmSync(join(publicDir, "docs"), { recursive: true, force: true });
  for (const doc of docs) {
    write(join(publicDir, "docs", `${doc.slug}.md`), doc.markdown);
    if (doc.file === "README.md")
      write(join(publicDir, "docs", "README.md"), doc.markdown);
  }
  write(
    join(generated, "docs.json"),
    JSON.stringify(
      docs.map(({ sections, ...doc }) => doc),
      null,
      0,
    ),
  );
  const groups = [...GROUPS.map((group) => group.title), OTHER_GROUP]
    .map((title) => ({
      title,
      pages: docs
        .filter((doc) => doc.group === title)
        .map(({ slug, title: pageTitle }) => ({ slug, title: pageTitle })),
    }))
    .filter((group) => group.pages.length > 0);
  write(join(generated, "nav.json"), JSON.stringify(groups));
  return docs;
}

function prepareOpenApi() {
  const file = join(root, "kernel-openapi.yaml");
  if (!existsSync(file)) {
    console.warn(
      "[portal] kernel-openapi.yaml no encontrado: referencia vacía",
    );
    write(join(generated, "openapi.json"), JSON.stringify({ paths: {} }));
    return { paths: {} };
  }
  const source = readFileSync(file, "utf8");
  const document = parse(source);
  write(join(generated, "openapi.json"), JSON.stringify(document));
  write(join(publicDir, "openapi.yaml"), source);
  return document;
}

const METHODS = ["get", "post", "put", "patch", "delete"];

function searchIndex(docs, openapi) {
  const entries = [];
  for (const doc of docs)
    for (const section of doc.sections)
      entries.push({
        kind: "doc",
        title: section.heading
          ? `${doc.title} · ${section.heading}`
          : doc.title,
        url: `/docs/${doc.slug}${section.id ? `#${section.id}` : ""}`,
        text: section.text.slice(0, 600),
      });
  for (const [path, item] of Object.entries(openapi.paths ?? {}))
    for (const method of METHODS) {
      const operation = item?.[method];
      if (!operation?.operationId) continue;
      const tag = operation.tags?.[0] ?? "Otros";
      entries.push({
        kind: "api",
        title: `${method.toUpperCase()} ${path}`,
        url: `/referencia/${tag.toLowerCase()}#${operation.operationId}`,
        text: `${operation.summary ?? ""} ${operation.operationId} ${plain(operation.description ?? "")}`.slice(
          0,
          400,
        ),
      });
    }
  write(join(publicDir, "search-index.json"), JSON.stringify(entries));
  return entries.length;
}

/** E8: copy the built shadcn registry (registry.json + one JSON per item). */
export function prepareRegistry() {
  const source = resolve(
    process.env.PORTAL_REGISTRY_DIR ?? join(root, "packages/registry/dist/r"),
  );
  const target = join(publicDir, "r");
  rmSync(target, { recursive: true, force: true });
  const index = join(source, "registry.json");
  // dist/r is not committed: build it from packages/registry when missing.
  const builder = join(root, "packages/registry/scripts/build.mjs");
  if (
    !existsSync(index) &&
    !process.env.PORTAL_REGISTRY_DIR &&
    existsSync(builder)
  )
    spawnSync(process.execPath, [builder], { cwd: root, stdio: "inherit" });
  if (!existsSync(index)) {
    console.warn(
      `[portal] Aviso: no está el registro de componentes (${source}/registry.json). /r queda vacío hasta que packages/registry (E8) se compile.`,
    );
    write(join(generated, "registry.json"), JSON.stringify(null));
    return 0;
  }
  mkdirSync(target, { recursive: true });
  const files = readdirSync(source).filter((file) => file.endsWith(".json"));
  for (const file of files)
    copyFileSync(join(source, file), join(target, file));
  const registry = JSON.parse(readFileSync(index, "utf8"));
  const items = (registry.items ?? []).map((item) => ({
    name: item.name,
    type: item.type ?? null,
    title: item.title ?? item.name,
    description: item.description ?? "",
    available: files.includes(`${item.name}.json`),
  }));
  write(
    join(generated, "registry.json"),
    JSON.stringify({ name: registry.name ?? "mirotaract", items }),
  );
  return items.length;
}

/** E10: run scripts/build-llms-txt.mjs and publish its output. */
export function prepareLlms() {
  const script = join(root, "scripts/build-llms-txt.mjs");
  const outDir = resolve(
    process.env.PORTAL_LLMS_DIR ?? join(root, "dist/llms"),
  );
  for (const name of ["llms.txt", "llms-full.txt"])
    rmSync(join(publicDir, name), { force: true });
  if (!process.env.PORTAL_LLMS_DIR) {
    if (!existsSync(script)) {
      console.warn(
        "[portal] Aviso: no está scripts/build-llms-txt.mjs (E10). /llms.txt y /llms-full.txt no se publican en este build.",
      );
      return false;
    }
    const run = spawnSync(process.execPath, [script], {
      cwd: root,
      encoding: "utf8",
    });
    if (run.status !== 0) {
      console.warn(
        `[portal] Aviso: build-llms-txt.mjs falló (${run.status}); /llms.txt no se publica.\n${run.stderr}`,
      );
      return false;
    }
  }
  let copied = 0;
  for (const name of ["llms.txt", "llms-full.txt"]) {
    const file = join(outDir, name);
    if (existsSync(file)) {
      copyFileSync(file, join(publicDir, name));
      copied += 1;
    }
  }
  if (copied < 2)
    console.warn(
      `[portal] Aviso: faltan archivos en ${outDir} (se copiaron ${copied} de 2).`,
    );
  return copied === 2;
}

function main() {
  mkdirSync(generated, { recursive: true });
  const docs = prepareDocs();
  const openapi = prepareOpenApi();
  const indexed = searchIndex(docs, openapi);
  const registryItems = prepareRegistry();
  const llms = prepareLlms();
  write(
    join(generated, "meta.json"),
    JSON.stringify({
      builtAt: new Date().toISOString(),
      contractVersion: openapi.info?.version ?? null,
      registryItems,
      llms,
    }),
  );
  console.log(
    `[portal] ${docs.length} páginas, ${indexed} entradas de búsqueda, registro: ${registryItems} componentes, llms.txt: ${llms ? "sí" : "no"}`,
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main();
