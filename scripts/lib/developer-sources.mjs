/**
 * Shared, deterministic readers for the developer-facing sources of truth:
 *
 * - docs/developers/*.md (the Spanish developer guides);
 * - kernel-openapi.yaml (the HTTP contract);
 * - the public event catalog (apps/institutional-kernel-api/.../webhooks/catalog.ts);
 * - the permission catalog (prisma/seed.ts + prisma/catalog-labels.ts) and the
 *   OAuth scopes (apps/institutional-kernel-api/.../oauth/scopes.ts).
 *
 * Used by scripts/build-llms-txt.mjs and by the @mirotaract/mcp bundle build.
 * Nothing here talks to a network or a database.
 */
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parse as parseYaml } from "yaml";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export const PATHS = {
  docs: "docs/developers",
  openapi: "kernel-openapi.yaml",
  catalog: "apps/institutional-kernel-api/src/application/webhooks/catalog.ts",
  scopes: "apps/institutional-kernel-api/src/application/oauth/scopes.ts",
  labels: "prisma/catalog-labels.ts",
  seed: "prisma/seed.ts",
};

/** Markdown → plain one-line text (for descriptions). */
export function plainText(markdown) {
  const code = [];
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, (_, inner) => `\u0000${code.push(inner) - 1}\u0000`)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|\s)[*_]+|[*_]+(\s|$)/g, " ")
    .replace(/[>#|]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\u0000(\d+)\u0000/g, (_, i) => code[Number(i)])
    .trim();
}

function firstSentence(text, max = 180) {
  const sentence = text.match(/^(.+?\.)(\s|$)/)?.[1] ?? text;
  if (sentence.length <= max) return sentence;
  return `${sentence.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
}

/** Title (first `# ` heading) and a one-line description (first paragraph). */
export function describeMarkdown(content) {
  const withoutComments = content.replace(/<!--[\s\S]*?-->/g, "");
  const lines = withoutComments.split("\n");
  const titleIndex = lines.findIndex((l) => /^#\s+/.test(l));
  const title = titleIndex >= 0 ? plainText(lines[titleIndex].replace(/^#\s+/, "")) : "";
  const paragraph = [];
  for (const line of lines.slice(titleIndex + 1)) {
    if (/^\s*$/.test(line)) {
      if (paragraph.length) break;
      continue;
    }
    if (/^(#|```|\||- |\* |\d+\. |>)/.test(line.trim())) {
      if (paragraph.length) break;
      continue;
    }
    paragraph.push(line.trim());
  }
  return { title, description: firstSentence(plainText(paragraph.join(" "))) };
}

/**
 * docs/developers/*.md, README first, then in the order README links them,
 * then the rest alphabetically. Deterministic.
 */
export function loadDeveloperDocs(root = REPO_ROOT) {
  const dir = join(root, PATHS.docs);
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort();
  const readme = files.includes("README.md") ? readFileSync(join(dir, "README.md"), "utf8") : "";
  // Order of the "## Guías" table (fallback: the whole README).
  const guides = readme.split(/^## Guías\s*$/m)[1]?.split(/^## /m)[0] ?? readme;
  const linked = [];
  for (const match of guides.matchAll(/\]\(([a-z0-9-]+\.md)(#[^)]*)?\)/g))
    if (files.includes(match[1]) && !linked.includes(match[1])) linked.push(match[1]);
  const ordered = [
    ...(files.includes("README.md") ? ["README.md"] : []),
    ...linked.filter((f) => f !== "README.md"),
    ...files.filter((f) => f !== "README.md" && !linked.includes(f)),
  ];
  return ordered.map((file) => {
    const content = readFileSync(join(dir, file), "utf8");
    const { title, description } = describeMarkdown(content);
    return {
      slug: file.replace(/\.md$/, ""),
      file,
      path: `${PATHS.docs}/${file}`,
      title,
      description,
      content,
    };
  });
}

export function loadOpenApiText(root = REPO_ROOT) {
  return readFileSync(join(root, PATHS.openapi), "utf8");
}

export function loadOpenApi(root = REPO_ROOT) {
  return parseYaml(loadOpenApiText(root));
}

/**
 * Imports a dependency-free TypeScript module. Node ≥ 22.18 strips types
 * natively; older runtimes fall back to the TypeScript compiler.
 */
export async function importTsModule(path) {
  const source = readFileSync(path, "utf8");
  const dir = mkdtempSync(join(tmpdir(), "mirotaract-src-"));
  try {
    const hash = createHash("sha1").update(source).digest("hex").slice(0, 10);
    const file = join(dir, `module-${hash}.mts`);
    writeFileSync(file, source);
    try {
      return await import(pathToFileURL(file).href);
    } catch (error) {
      if (!/ERR_UNKNOWN_FILE_EXTENSION|Unexpected token|strip/i.test(`${error?.code} ${error?.message}`)) throw error;
      const ts = (await import("typescript")).default;
      const js = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText;
      const jsFile = join(dir, `module-${hash}.mjs`);
      writeFileSync(jsFile, js);
      return await import(pathToFileURL(jsFile).href);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Body of `GET /events/catalog`, computed from the kernel source. */
export async function loadEventCatalog(root = REPO_ROOT) {
  const mod = await importTsModule(join(root, PATHS.catalog));
  return mod.catalogDocument();
}

function parseStringArray(text) {
  return [...text.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

/** `const name = [ ... ];` or `const name: T = [ ... ];` → strings. */
function arrayLiteral(source, name) {
  const match = source.match(new RegExp(`const ${name}(?::[^=]+)?\\s*=\\s*\\[([\\s\\S]*?)\\];`));
  return match ? parseStringArray(match[1].replace(/\/\/.*$/gm, "")) : [];
}

/** rolePermissions from prisma/seed.ts → { ROLE: [codes] } (spreads resolved). */
export function parseRolePermissions(seedSource) {
  const shared = { selfServicePermissions: arrayLiteral(seedSource, "selfServicePermissions") };
  const block = seedSource.match(/const rolePermissions[^=]*=\s*\{([\s\S]*?)\n\};/)?.[1] ?? "";
  const roles = {};
  for (const match of block.matchAll(/([A-Z_]+):\s*(\[[\s\S]*?\]|[A-Za-z]+),/g)) {
    const [, role, value] = match;
    if (!value.startsWith("[")) {
      roles[role] = [...(shared[value] ?? [])];
      continue;
    }
    const codes = [];
    for (const spread of value.matchAll(/\.\.\.([A-Za-z]+)/g)) codes.push(...(shared[spread[1]] ?? []));
    codes.push(...parseStringArray(value.replace(/\/\/.*$/gm, "")));
    roles[role] = [...new Set(codes)];
  }
  return roles;
}

/**
 * The scope required by each service endpoint, from the "Resumen de scopes
 * por endpoint" table of api-de-datos.md (some operations of the contract
 * don't carry `x-required-scope`).
 */
export function parseScopeTable(apiDocsMarkdown) {
  const section = apiDocsMarkdown.split(/^## Resumen de scopes por endpoint/m)[1] ?? "";
  const map = {};
  for (const match of section.matchAll(/^\|\s*`(GET|POST|PUT|PATCH|DELETE) ([^`]+)`\s*\|\s*`([^`]+)`\s*\|/gm))
    map[`${match[1]} ${match[2]}`] = match[3];
  return map;
}

/** Permission and scope catalog (codes, labels, which seed roles hold each). */
export async function loadPermissionCatalog(root = REPO_ROOT) {
  const labels = await importTsModule(join(root, PATHS.labels));
  const scopes = await importTsModule(join(root, PATHS.scopes));
  const seed = readFileSync(join(root, PATHS.seed), "utf8");
  const codes = arrayLiteral(seed, "permissionCodes");
  const rolePermissions = parseRolePermissions(seed);
  const apiDocs = readFileSync(join(root, PATHS.docs, "api-de-datos.md"), "utf8");
  const endpointScopes = parseScopeTable(apiDocs);
  const endpointsByScope = {};
  for (const [endpoint, scope] of Object.entries(endpointScopes)) (endpointsByScope[scope] ??= []).push(endpoint);
  return {
    kernelPermissions: codes.map((code) => ({
      code,
      name: labels.permissionNames[code] ?? code,
      roles: Object.keys(rolePermissions)
        .filter((role) => rolePermissions[role].includes(code))
        .sort(),
    })),
    roles: Object.keys(rolePermissions)
      .sort()
      .map((code) => ({ code, name: labels.roleNames[code] ?? code })),
    positions: Object.entries(labels.positionNames).map(([code, name]) => ({ code, name })),
    oidcScopes: Object.entries(scopes.OIDC_SCOPES).map(([scope, label]) => ({ scope, label })),
    serviceScopes: Object.entries(scopes.SERVICE_SCOPE_LABELS).map(([scope, label]) => ({
      scope,
      label,
      endpoints: (endpointsByScope[scope] ?? []).sort(),
    })),
    endpointScopes,
    sources: [PATHS.seed, PATHS.labels, PATHS.scopes, `${PATHS.docs}/api-de-datos.md`],
  };
}

const METHODS = ["get", "post", "put", "patch", "delete"];

/** Flat list of operations (stable order: contract order). */
export function listOperations(openapi, endpointScopes = {}) {
  const ops = [];
  for (const [path, item] of Object.entries(openapi.paths ?? {}))
    for (const method of METHODS) {
      const op = item?.[method];
      if (!op) continue;
      const key = `${method.toUpperCase()} ${path}`;
      ops.push({
        operationId: op.operationId,
        method: method.toUpperCase(),
        path,
        tag: op.tags?.[0] ?? "",
        summary: op.summary ?? "",
        permission: op["x-required-permission"] ?? null,
        scope: op["x-required-scope"] ?? endpointScopes[key] ?? null,
        public: Array.isArray(op.security) && op.security.length === 0,
        serviceOnly: Boolean(op["x-service-only"]) || path.startsWith("/service/"),
      });
    }
  return ops;
}
