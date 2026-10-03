#!/usr/bin/env node
/**
 * E10.3 — builds dist/llms/llms.txt (index, https://llmstxt.org) and
 * dist/llms/llms-full.txt (every developer guide, the event catalog and an
 * API summary) from docs/developers/*.md, the event catalog and
 * kernel-openapi.yaml. Deterministic: same sources → same bytes (no dates).
 *
 *   node scripts/build-llms-txt.mjs [--out dist/llms] [--base-url https://developers.rotaract4845.com]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import {
  listOperations,
  loadDeveloperDocs,
  loadEventCatalog,
  loadOpenApi,
  loadPermissionCatalog,
  PATHS,
  REPO_ROOT,
} from "./lib/developer-sources.mjs";

export const DEFAULT_BASE_URL = "https://developers.rotaract4845.com";
const API_BASE = "https://api.rotaract4845.com/api/kernel/v1";

/** Stable JSON (sorted keys) so the output never depends on insertion order. */
export function stableJson(value, indent = 2) {
  const sort = (v) =>
    Array.isArray(v)
      ? v.map(sort)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, sort(v[k])]),
          )
        : v;
  return JSON.stringify(sort(value), null, indent);
}

function apiSummary(openapi, endpointScopes) {
  const ops = listOperations(openapi, endpointScopes);
  const byTag = new Map();
  for (const op of ops) {
    if (!byTag.has(op.tag)) byTag.set(op.tag, []);
    byTag.get(op.tag).push(op);
  }
  const lines = [
    `# Resumen de la API (kernel-openapi.yaml, versión ${openapi.info?.version ?? "?"})`,
    "",
    `Base: \`${API_BASE}\`. Columna "Requiere": \`scope\` de servicio (token de`,
    "app, rutas `/service/*`), permiso de persona (`kernel.*`, token de sesión de",
    "Mi Rotaract) o `público`. Detalle completo de cada operación: el contrato",
    "OpenAPI o la herramienta MCP `describe_operation`.",
  ];
  for (const [tag, list] of [...byTag.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    lines.push(
      "",
      `## ${tag || "(sin tag)"}`,
      "",
      "| Operación | Método y ruta | Qué hace | Requiere |",
      "|---|---|---|---|",
    );
    for (const op of list) {
      const needs = op.scope
        ? `scope \`${op.scope}\``
        : op.permission && !String(op.permission).startsWith("dynamic:")
          ? `permiso \`${op.permission}\``
          : op.public || op.permission === null
            ? "público"
            : `\`${op.permission}\``;
      lines.push(
        `| \`${op.operationId}\` | \`${op.method} ${op.path}\` | ${op.summary.replace(/\|/g, "\\|")} | ${needs} |`,
      );
    }
  }
  return lines.join("\n");
}

function eventSummary(catalog) {
  const lines = [
    "# Catálogo de eventos (JSON de `GET /events/catalog`)",
    "",
    "Firma, sobre (envelope) y el JSON Schema de `data` de cada tipo, tal como",
    "lo sirve el kernel. Generado del código fuente del catálogo.",
    "",
    "```json",
    stableJson(catalog),
    "```",
  ];
  return lines.join("\n");
}

/** The generic master prompt (packages/ai-skills, single source). */
async function masterPrompt(root) {
  const skills = await import(
    pathToFileURL(join(root, "packages/ai-skills/src/index.js")).href
  );
  return skills.renderMasterPrompt(skills.loadMasterTemplate(), {});
}

/** Pure builder: returns both files as strings. */
export async function buildLlms({
  root = REPO_ROOT,
  baseUrl = DEFAULT_BASE_URL,
} = {}) {
  const base = baseUrl.replace(/\/+$/, "");
  const docs = loadDeveloperDocs(root);
  const openapi = loadOpenApi(root);
  const catalog = await loadEventCatalog(root);
  const permissions = await loadPermissionCatalog(root);
  const readme = docs.find((d) => d.slug === "README");
  const guides = docs.filter((d) => d.slug !== "README");

  const llms = [
    "# Mi Rotaract para desarrolladores",
    "",
    "> Plataforma de desarrolladores del Distrito Rotaract 4845 (Paraguay): el Kernel",
    "> Institucional es la única fuente de verdad de personas, clubes, membresías,",
    "> períodos, cargos y autoridades. Las apps de los comités se integran por OAuth 2.0 /",
    '> OpenID Connect ("Ingresar con Mi Rotaract"), la API de datos `/service/*` con',
    "> token de servicio y webhooks firmados. Documentación en castellano.",
    "",
    "Reglas que no se negocian: tokens nunca en localStorage/sessionStorage; verificar",
    "tokens con el JWKS (ES256, iss, aud); scopes mínimos; verificar la firma de cada",
    "webhook; secretos solo en variables de entorno del servidor; nada de datos",
    "personales en los logs. Para desarrollar sin datos reales: `mirotaract dev`.",
    "",
    "## Empezar",
    "",
    ...(readme
      ? [`- [${readme.title}](${base}/docs/README.md): ${readme.description}`]
      : []),
    `- [Documentación completa en un archivo](${base}/llms-full.txt): todas las guías, el catálogo de eventos y un resumen de la API.`,
    `- [Prompt maestro "Creá tu solución con IA"](${base}/ia/prompt.md): instrucciones paso a paso para que un asistente de código construya una app conectada a Mi Rotaract (requisitos, herramientas oficiales, plan, kernel local, arquitectura, seguridad, producción). Página: ${base}/ia.`,
    `- [Skills de IA (paquete versionado)](${base}/ia/skills.json): las skills de Claude Code, Cursor, Copilot y AGENTS.md en un JSON, con su SHA-256 en /ia/skills.json.sha256.`,
    "",
    "## Guías",
    "",
    ...guides.map(
      (d) => `- [${d.title}](${base}/docs/${d.slug}.md): ${d.description}`,
    ),
    "",
    "## Contratos",
    "",
    `- [Contrato OpenAPI](${API_BASE.replace(/\/api\/kernel\/v1$/, "")}/openapi.yaml): ${PATHS.openapi}, versión ${openapi.info?.version ?? "?"}; ${listOperations(openapi).length} operaciones.`,
    `- [Catálogo de eventos (JSON)](${API_BASE}/events/catalog): ${catalog.events.length} tipos de evento con su JSON Schema y un ejemplo.`,
    `- [Discovery OIDC](${API_BASE}/.well-known/openid-configuration): issuer, endpoints y JWKS para "Ingresar con Mi Rotaract".`,
    "",
    "## Optional",
    "",
    `- [Scopes de servicio](${base}/docs/conceptos.md#scopes): ${permissions.serviceScopes.length} scopes de servicio y ${permissions.oidcScopes.length} scopes OIDC.`,
    `- [Skills de IA y servidor MCP \`@mirotaract/mcp\`](${base}/docs/ia.md): buscar en la documentación, describir operaciones, listar permisos y eventos, validar manifiestos de módulo y generar tipos desde tu asistente.`,
    "",
  ].join("\n");

  const full = [
    "# Mi Rotaract para desarrolladores — documentación completa",
    "",
    "> Todas las guías de docs/developers, el catálogo de eventos y un resumen de la",
    "> API, en un solo archivo para asistentes de IA. Índice: llms.txt.",
    "",
    ...docs.flatMap((d) => [
      "",
      "---",
      "",
      `<!-- source: ${d.path} -->`,
      "",
      d.content.trim(),
      "",
    ]),
    "",
    "---",
    "",
    `<!-- source: packages/ai-skills/prompts/_master.md (versión genérica, ${base}/ia/prompt.md) -->`,
    "",
    "# Prompt maestro: creá tu solución para Rotaract con IA",
    "",
    "> Lo que una persona le pega a su asistente de código desde",
    `> ${base}/ia. Si te lo pasan, seguilo paso a paso.`,
    "",
    (await masterPrompt(root)).trim(),
    "",
    "---",
    "",
    eventSummary(catalog),
    "",
    "---",
    "",
    apiSummary(openapi, permissions.endpointScopes),
    "",
  ].join("\n");

  return {
    llms,
    full,
    stats: {
      docs: docs.length,
      events: catalog.events.length,
      operations: listOperations(openapi).length,
    },
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      out: { type: "string", default: "dist/llms" },
      "base-url": { type: "string", default: DEFAULT_BASE_URL },
    },
  });
  const out = resolve(process.cwd(), values.out);
  const { llms, full, stats } = await buildLlms({
    baseUrl: values["base-url"],
  });
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "llms.txt"), llms);
  writeFileSync(join(out, "llms-full.txt"), full);
  process.stdout.write(
    `llms.txt y llms-full.txt en ${out} (${stats.docs} guías, ${stats.events} eventos, ${stats.operations} operaciones).\n`,
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exit(1);
  });
}
