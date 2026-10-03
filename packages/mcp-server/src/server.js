/**
 * @mirotaract/mcp — the official Mi Rotaract MCP server.
 *
 * Read-only knowledge (docs, OpenAPI contract, permissions, events, module
 * manifests, generated types) comes from a bundle built from the monorepo and
 * never touches a network. The only tools that call a kernel are the sandbox
 * ones, and they refuse anything that is not a local `mirotaract dev` kernel
 * with synthetic data. Nothing here returns personal data.
 */
import { readFileSync } from "node:fs";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { loadBundle } from "./bundle.js";
import { generateTypes } from "./codegen.js";
import { validateModuleManifest } from "./manifest.js";
import { describeOperation, findOperation } from "./openapi.js";
import { isLocalKernel, Sandbox, SandboxError } from "./sandbox.js";
import { anchor, createIndex, search, splitSections } from "./search.js";

export const VERSION = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
export const PRODUCTION_ISSUER = "https://api.rotaract4845.com/api/kernel/v1";

export const INSTRUCTIONS = `Servidor MCP oficial de Mi Rotaract (Distrito Rotaract 4845). Usalo para integrar apps con el kernel institucional sin adivinar:
- search_docs / read_doc: guías de docs/developers (castellano).
- describe_operation: parámetros, esquemas, permiso o scope y ejemplos TS/Python/curl de cualquier operación de kernel-openapi.yaml.
- list_permissions, list_events: catálogos de permisos/scopes y de eventos de webhooks.
- validate_module_manifest: valida mirotaract.module.json.
- generate_types: tipos TS o Python de la API y los eventos.
- create_test_app, issue_test_token: SOLO contra un kernel local (mirotaract dev, datos sintéticos).
Reglas: tokens nunca en localStorage; verificar tokens con el JWKS (ES256, iss, aud); scopes mínimos; verificar la firma de cada webhook; secretos solo en el servidor; nada de datos personales en logs.`;

const text = (value) => ({ content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] });
const failure = (message) => ({ isError: true, content: [{ type: "text", text: message }] });

function table(headers, rows) {
  const esc = (v) => String(v ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
  return [`| ${headers.join(" | ")} |`, `|${headers.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.map(esc).join(" | ")} |`)].join("\n");
}

/** Server config from the environment (or explicit options in tests). */
export function resolveConfig(env = process.env) {
  const baseUrl = (env.MIROTARACT_BASE_URL || env.MIROTARACT_ISSUER || "").replace(/\/+$/, "") || null;
  return {
    baseUrl,
    mode: baseUrl && isLocalKernel(baseUrl) ? "sandbox" : "production",
    admin: {
      email: env.MIROTARACT_SANDBOX_ADMIN_EMAIL || "admin@example.org",
      password: env.MIROTARACT_SANDBOX_ADMIN_PASSWORD || "sandbox-9999",
    },
  };
}

export async function createServer({ env = process.env, fetch: fetchImpl = globalThis.fetch, bundle } = {}) {
  const data = bundle ?? (await loadBundle());
  const config = resolveConfig(env);
  const index = createIndex(data.docs);
  const sandbox = new Sandbox({ baseUrl: config.baseUrl, fetch: fetchImpl, admin: config.admin });
  const subscribable = data.events.events.map((e) => e.type).filter((t) => t !== "ping.v1");
  const eventScopes = Object.fromEntries(data.events.events.filter((e) => e.scope).map((e) => [e.type, e.scope]));

  const server = new McpServer({ name: "mirotaract", title: "Mi Rotaract", version: VERSION }, { instructions: INSTRUCTIONS });
  const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

  server.registerTool(
    "search_docs",
    {
      title: "Buscar en la documentación",
      description: "Busca en las guías para desarrolladores de Mi Rotaract (docs/developers, en castellano) y devuelve las secciones más relevantes con su ruta y un extracto. Usalo antes de escribir código de login, API de datos, webhooks, permisos o la CLI.",
      inputSchema: {
        query: z.string().min(2).describe("Qué buscás, en castellano o inglés (por ejemplo: \"verificar id_token nonce\")."),
        limit: z.number().int().min(1).max(20).optional().describe("Cantidad de resultados (5 por defecto)."),
      },
      annotations: readOnly,
    },
    async ({ query, limit }) => {
      const results = search(index, query, limit ?? 5);
      if (!results.length) return text(`Sin resultados para "${query}". Guías disponibles: ${data.docs.map((d) => d.slug).join(", ")}.`);
      return text(
        results
          .map((r, i) => `## ${i + 1}. ${r.heading} — ${r.path}${r.anchor ? `#${r.anchor}` : ""}\n\n${r.snippet}`)
          .concat(["", "Leé una guía o sección completa con read_doc."])
          .join("\n\n"),
      );
    },
  );

  server.registerTool(
    "read_doc",
    {
      title: "Leer una guía",
      description: "Devuelve una guía completa de docs/developers en Markdown, o solo una sección (por título o ancla).",
      inputSchema: {
        slug: z.string().describe("Nombre de la guía sin .md (README, ingresar-con-mi-rotaract, api-de-datos, webhooks, …)."),
        section: z.string().optional().describe("Título o ancla de una sección (opcional)."),
      },
      annotations: readOnly,
    },
    async ({ slug, section }) => {
      const doc = data.docs.find((d) => d.slug === slug.replace(/\.md$/, "").replace(/^docs\/developers\//, ""));
      if (!doc) return failure(`No existe la guía "${slug}". Guías: ${data.docs.map((d) => d.slug).join(", ")}.`);
      if (!section) return text(doc.content);
      const wanted = anchor(section.replace(/^#/, ""));
      const found = splitSections(doc).find((s) => s.anchor === wanted || anchor(s.heading).includes(wanted));
      if (!found) return failure(`La guía ${doc.slug} no tiene la sección "${section}".`);
      return text(`## ${found.heading}\n\n${found.text}`);
    },
  );

  server.registerTool(
    "describe_operation",
    {
      title: "Describir una operación de la API",
      description: "Describe una operación del contrato kernel-openapi.yaml: parámetros, cuerpo, respuestas, el scope de servicio o permiso que exige, y ejemplos en TypeScript, Python y curl. Buscala por operationId (serviceListMembers) o por método y ruta (GET /service/organizations/{organizationId}/members).",
      inputSchema: {
        operationId: z.string().optional().describe("operationId, por ejemplo serviceListMembers o issueOAuthToken."),
        method: z.string().optional().describe("GET, POST, … (con path)."),
        path: z.string().optional().describe("Ruta, con o sin /api/kernel/v1; acepta ids concretos."),
      },
      annotations: readOnly,
    },
    async ({ operationId, method, path }) => {
      if (!operationId && !path) return failure("Pasá operationId, o method + path.");
      const { found, suggestions = [] } = findOperation(data.openapi, { operationId, method, path });
      if (!found)
        return failure(
          suggestions.length
            ? `No encontré una única operación. ¿Quisiste decir…?\n${suggestions.map((s) => `- ${s.op.operationId}: ${s.method.toUpperCase()} ${s.path} — ${s.op.summary ?? ""}`).join("\n")}`
            : "No encontré esa operación en kernel-openapi.yaml.",
        );
      return text(describeOperation(data.openapi, found, data.permissions.endpointScopes).markdown);
    },
  );

  server.registerTool(
    "list_permissions",
    {
      title: "Listar permisos y scopes",
      description: "Lista los permisos del kernel (kernel.*, con los roles que los tienen por defecto), los scopes de servicio (kernel.service.*, con sus endpoints) y los scopes OIDC del login, desde el catálogo del kernel. Los módulos definen permisos propios con el prefijo de su id.",
      inputSchema: {
        kind: z.enum(["all", "kernel", "service", "oidc"]).optional().describe("Qué familia (all por defecto)."),
        query: z.string().optional().describe("Filtra por texto (código o descripción)."),
      },
      annotations: readOnly,
    },
    async ({ kind = "all", query }) => {
      const p = data.permissions;
      const match = (...fields) => !query || fields.some((f) => String(f ?? "").toLowerCase().includes(query.toLowerCase()));
      const parts = [];
      if (kind === "all" || kind === "oidc")
        parts.push("## Scopes OIDC (\"Ingresar con Mi Rotaract\"; los acepta cada persona)", "", table(["Scope", "Etiqueta en el consentimiento"], p.oidcScopes.filter((s) => match(s.scope, s.label)).map((s) => [`\`${s.scope}\``, s.label])));
      if (kind === "all" || kind === "service")
        parts.push("", "## Scopes de servicio (token de app, client_credentials; los otorga el distrito)", "", table(["Scope", "Para qué", "Endpoints"], p.serviceScopes.filter((s) => match(s.scope, s.label)).map((s) => [`\`${s.scope}\``, s.label, s.endpoints.map((e) => `\`${e}\``).join(", ")])), "", "Pedí solo los que usás. `kernel.service.persons.contact.read` solo si la app contacta personas.");
      if (kind === "all" || kind === "kernel")
        parts.push("", "## Permisos del kernel (se consultan con POST /service/authorization/check)", "", table(["Permiso", "Qué permite", "Roles con este permiso por defecto"], p.kernelPermissions.filter((k) => match(k.code, k.name)).map((k) => [`\`${k.code}\``, k.name, k.roles.join(", ")])), "", "Roles: " + p.roles.map((r) => `${r.code} (${r.name})`).join(", ") + ".", "", "Los permisos de un módulo viven en su namespace (`<moduleId>.<recurso>.<acción>`) y se declaran en mirotaract.module.json.");
      parts.push("", `Fuentes: ${p.sources.join(", ")}.`);
      return text(parts.join("\n"));
    },
  );

  server.registerTool(
    "list_events",
    {
      title: "Listar eventos de webhooks",
      description: "Lista los tipos de evento que Mi Rotaract manda por webhook (catálogo público), con el scope que necesita la app y la regla de firma. Con `type` devuelve el JSON Schema de data y un ejemplo completo del cuerpo.",
      inputSchema: { type: z.string().optional().describe("Tipo con versión, por ejemplo membership.activated.v1.") },
      annotations: readOnly,
    },
    async ({ type }) => {
      const catalog = data.events;
      if (type) {
        const event = catalog.events.find((e) => e.type === type);
        if (!event) return failure(`No existe ${type}. Tipos: ${catalog.events.map((e) => e.type).join(", ")}.`);
        return text([`# ${event.type} — ${event.title}`, "", event.description, "", `Scope que necesita la app: ${event.scope ? `\`${event.scope}\`` : "ninguno"}.`, "", "## JSON Schema de `data`", "", "```json", JSON.stringify(event.schema, null, 2), "```", "", "## Ejemplo del cuerpo (POST)", "", "```json", JSON.stringify(event.example, null, 2), "```"].join("\n"));
      }
      const sig = catalog.signature;
      return text(
        [
          table(["Tipo", "Qué pasó", "Scope", "Descripción"], catalog.events.map((e) => [`\`${e.type}\``, e.title, e.scope ? `\`${e.scope}\`` : "—", e.description])),
          "",
          `Firma: ${sig.algorithm} sobre \`${sig.signedPayload}\`, encabezados ${Object.values(sig.headers).map((h) => `\`${h}\``).join(", ")}, tolerancia ${sig.toleranceSec} s. Cuerpo: { id, type, createdAt, organizationId, data }; el id se repite en los reintentos (deduplicá por él).`,
        ].join("\n"),
      );
    },
  );

  server.registerTool(
    "validate_module_manifest",
    {
      title: "Validar un manifiesto de módulo",
      description: "Valida un mirotaract.module.json contra el contrato de módulos v1: id y namespace de permisos, scopeType, eventos del catálogo (y el scope que exigen), configurationSchema, ui y scopes OAuth mínimos. Devuelve ok, errores con su ruta y advertencias.",
      inputSchema: {
        manifest: z.union([z.string(), z.record(z.string(), z.any())]).describe("El manifiesto: objeto JSON o el texto del archivo."),
      },
      annotations: readOnly,
    },
    async ({ manifest }) => text(await validateModuleManifest(manifest, { eventTypes: subscribable, eventScopes })),
  );

  server.registerTool(
    "generate_types",
    {
      title: "Generar tipos",
      description: "Genera tipos TypeScript (openapi-typescript + eventos) o Python (TypedDict) de la API del kernel y del catálogo de eventos, igual que `mirotaract gen types`, desde el contrato empaquetado (sin red).",
      inputSchema: {
        lang: z.enum(["ts", "python"]).optional().describe("ts (por defecto) o python."),
        include: z.enum(["all", "api", "events"]).optional().describe("all (por defecto), solo la API o solo los eventos."),
      },
      annotations: readOnly,
    },
    async ({ lang = "ts", include = "all" }) => {
      const result = await generateTypes(data, { lang, include });
      return text(`// Archivo sugerido: ${result.file} (${result.events} eventos)\n${result.code}`);
    },
  );

  const sandboxNote = `Solo sandbox: funciona únicamente si MIROTARACT_BASE_URL apunta a un kernel local (mirotaract dev, localhost) con datos sintéticos. Configurado: ${config.baseUrl ?? "ninguno"} (${config.mode === "sandbox" ? "local" : "no local: se niega"}).`;
  const sandboxAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

  server.registerTool(
    "create_test_app",
    {
      title: "Crear una app de prueba (sandbox)",
      description: `Registra una app de prueba en el distrito sintético del kernel local, con los scopes y direcciones de regreso (localhost) que pidas, y devuelve su client_id y secreto de prueba. ${sandboxNote}`,
      inputSchema: {
        name: z.string().min(2).max(80).optional(),
        type: z.enum(["CONFIDENTIAL", "PUBLIC"]).optional().describe("CONFIDENTIAL (servidor, por defecto) o PUBLIC (SPA/móvil)."),
        scopes: z.array(z.string()).optional().describe("Scopes mínimos que necesita la app."),
        grantTypes: z.array(z.enum(["client_credentials", "authorization_code", "refresh_token"])).optional(),
        redirectUris: z.array(z.string()).optional().describe("Solo http://localhost:<puerto>/…"),
        organization: z.string().optional().describe("Club del sandbox (id, código SBX-… o nombre). Por defecto, el distrito sintético."),
      },
      annotations: sandboxAnnotations,
    },
    async (args) => {
      try {
        return text(await sandbox.createTestApp(args));
      } catch (error) {
        if (error instanceof SandboxError) return failure(error.message);
        throw error;
      }
    },
  );

  server.registerTool(
    "issue_test_token",
    {
      title: "Emitir un token de prueba (sandbox)",
      description: `Emite un token de servicio de prueba (client_credentials) para una app del sandbox local: la última creada con create_test_app o la que indiques. ${sandboxNote}`,
      inputSchema: {
        clientId: z.string().optional(),
        clientSecret: z.string().optional(),
        scope: z.union([z.string(), z.array(z.string())]).optional().describe("Subconjunto de scopes para este token."),
      },
      annotations: sandboxAnnotations,
    },
    async (args) => {
      try {
        return text(await sandbox.issueTestToken(args));
      } catch (error) {
        if (error instanceof SandboxError) return failure(error.message);
        throw error;
      }
    },
  );

  return { server, config, bundle: data };
}
