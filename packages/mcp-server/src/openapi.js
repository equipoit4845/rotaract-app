/**
 * describe_operation: everything an assistant needs to call one operation of
 * kernel-openapi.yaml correctly (parameters, schemas, what it requires) plus
 * copy-ready examples in TypeScript, Python and curl.
 */
import { fold } from "./search.js";

const METHODS = ["get", "post", "put", "patch", "delete"];
const API = "https://api.rotaract4845.com/api/kernel/v1";

/** SDK equivalents (both SDKs share the surface). */
const SDK = {
  serviceListOrganizations: { ts: "client.clubs.list({ type: \"CLUB\" })", py: "client.clubs.list(type=\"CLUB\")", paginated: true },
  serviceGetOrganization: { ts: "await client.clubs.get(organizationId)", py: "client.clubs.get(organization_id)" },
  serviceListMembers: { ts: "client.members.list(organizationId, { status: \"ACTIVE\", limit: 100 })", py: "client.members.list(organization_id, status=\"ACTIVE\", limit=100)", paginated: true },
  serviceListAuthorities: { ts: "await client.authorities.list(organizationId, { includeDescendants: false })", py: "client.authorities.list(organization_id, include_descendants=False)" },
  serviceListPeriods: { ts: "await client.periods.list(organizationId, { status: \"ACTIVE\" })", py: "client.periods.list(organization_id, status=\"ACTIVE\")" },
  serviceBatchPersons: { ts: "await client.persons.batch(personIds)", py: "client.persons.batch(person_ids)" },
  servicePersonMemberships: { ts: "await client.persons.memberships(personId)", py: "client.persons.memberships(person_id)" },
  serviceGetPerson: { ts: "await client.persons.get(personId)", py: "client.persons.get(person_id)" },
  serviceCheckAuthorization: {
    ts: "await client.permissions.check({ personId, permission: \"kernel.membership.read\", organizationId })",
    py: "client.permissions.check(person_id=person_id, permission=\"kernel.membership.read\", organization_id=organization_id)",
  },
  serviceBatchCheckAuthorization: { ts: "await client.permissions.checkMany(checks)", py: "client.permissions.check_many(checks)" },
};

export function allOperations(openapi) {
  const list = [];
  for (const [path, item] of Object.entries(openapi.paths ?? {}))
    for (const method of METHODS) if (item?.[method]) list.push({ path, method, op: item[method], item });
  return list;
}

function pathMatches(template, path) {
  const re = new RegExp(`^${template.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\\?\{[^}]+\\?\}|\{[^}]+\}/g, "[^/]+")}$`);
  return re.test(path) || template === path;
}

/** By operationId, or by method + path (concrete or templated). */
export function findOperation(openapi, { operationId, method, path }) {
  const ops = allOperations(openapi);
  if (operationId) {
    const exact = ops.find((o) => o.op.operationId === operationId);
    if (exact) return { found: exact };
    const needle = fold(operationId);
    const word = new RegExp(`${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z])`, "i");
    const rank = (o) => (word.test(o.op.operationId ?? "") ? 0 : fold(o.op.operationId ?? "").includes(needle) ? 1 : 2);
    const suggestions = ops
      .filter((o) => fold(o.op.operationId ?? "").includes(needle) || fold(o.op.summary ?? "").includes(needle))
      .sort((a, b) => rank(a) - rank(b));
    return { suggestions: suggestions.slice(0, 10) };
  }
  if (path) {
    const clean = path.replace(/^https?:\/\/[^/]+/, "").replace(/^\/api\/kernel\/v1/, "").split("?")[0];
    const candidates = ops.filter((o) => pathMatches(o.path, clean) && (!method || o.method === method.toLowerCase()));
    if (candidates.length === 1) return { found: candidates[0] };
    return { suggestions: candidates.length ? candidates : ops.filter((o) => o.path.includes(clean.split("/").filter(Boolean)[0] ?? "")).slice(0, 8) };
  }
  return { suggestions: [] };
}

export function resolveRef(openapi, ref) {
  return ref.replace(/^#\//, "").split("/").reduce((node, key) => node?.[key.replace(/~1/g, "/").replace(/~0/g, "~")], openapi);
}

/** Inline $refs up to `depth` levels (deeper ones stay as `{ $ref }`). */
export function inlineSchema(openapi, schema, depth = 3, seen = new Set()) {
  if (!schema || typeof schema !== "object") return schema;
  if (Array.isArray(schema)) return schema.map((s) => inlineSchema(openapi, s, depth, seen));
  if (schema.$ref) {
    if (depth <= 0 || seen.has(schema.$ref)) return { $ref: schema.$ref };
    const target = resolveRef(openapi, schema.$ref);
    return { "x-schema": schema.$ref.split("/").pop(), ...inlineSchema(openapi, target, depth - 1, new Set([...seen, schema.$ref])) };
  }
  return Object.fromEntries(Object.entries(schema).map(([k, v]) => [k, inlineSchema(openapi, v, depth, seen)]));
}

function parameterList(openapi, item, op) {
  const raw = [...(item.parameters ?? []), ...(op.parameters ?? [])];
  return raw.map((p) => (p.$ref ? resolveRef(openapi, p.$ref) : p)).filter(Boolean);
}

function schemaLabel(openapi, schema) {
  if (!schema) return "";
  if (schema.$ref) return schema.$ref.split("/").pop();
  if (schema.type === "array") return `${schemaLabel(openapi, schema.items)}[]`;
  if (schema.enum) return schema.enum.map((e) => JSON.stringify(e)).join(" | ");
  return Array.isArray(schema.type) ? schema.type.join(" | ") : (schema.type ?? "object");
}

function placeholder(name) {
  return `$${name.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase()}`;
}

function snake(name) {
  return name.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
}

/** What a caller needs: service scope, person permission, OAuth client or nothing. */
export function requirement(op, path, endpointScopes = {}) {
  const key = `${(op.method ?? "").toUpperCase()} ${path}`;
  const scope = op["x-required-scope"] ?? endpointScopes[key] ?? null;
  if (path.startsWith("/service/") || op["x-service-only"] || scope)
    return { kind: "service", scope, text: `Token de servicio (client_credentials, app CONFIDENTIAL) con el scope \`${scope ?? "kernel.service.*"}\`. Solo desde el servidor.` };
  if (path.startsWith("/oauth/") || path.startsWith("/.well-known/") || path === "/events/catalog")
    return { kind: "oauth", scope: null, text: path === "/oauth/token" || path === "/oauth/revoke" ? "Credenciales de la app (client_secret_basic, o client_id solo en apps PUBLIC)." : path === "/oauth/userinfo" ? "Access token de una persona (Bearer), emitido por \"Ingresar con Mi Rotaract\"." : "Público (sin autenticación)." };
  const permission = op["x-required-permission"];
  if (permission === null || (Array.isArray(op.security) && op.security.length === 0))
    return { kind: "public", scope: null, text: "Público (sin autenticación)." };
  return {
    kind: "person",
    permission,
    scope: null,
    text: `Sesión de una persona de Mi Rotaract con el permiso \`${permission}\` en la organización. Estas rutas son las que usa la web de Mi Rotaract; una app de comité usa \`/service/*\`.`,
  };
}

function exampleBody(openapi, op) {
  const media = op.requestBody?.content?.["application/json"] ?? op.requestBody?.content?.["application/x-www-form-urlencoded"];
  if (!media) return null;
  if (media.example) return media.example;
  return exampleValue(openapi, media.schema, "body", 3);
}

/** A small example value: required fields (plus organizationId), recursively. */
function exampleValue(openapi, raw, name, depth) {
  const schema = raw?.$ref ? resolveRef(openapi, raw.$ref) : raw;
  if (!schema) return `<${name}>`;
  if (schema.example !== undefined) return schema.example;
  if (schema.enum) return schema.enum.find((v) => v !== "PLATFORM") ?? schema.enum[0];
  const type = Array.isArray(schema.type) ? schema.type.find((t) => t !== "null") : schema.type;
  if (type === "array") return depth > 0 && schema.items ? [exampleValue(openapi, schema.items, name, depth - 1)] : [];
  if (type === "object" || schema.properties) {
    if (depth <= 0 || !schema.properties) return {};
    const names = [...new Set([...(schema.required ?? []), ...("organizationId" in schema.properties ? ["organizationId"] : [])])];
    return Object.fromEntries(names.map((n) => [n, exampleValue(openapi, schema.properties[n], n, depth - 1)]));
  }
  if (type === "integer" || type === "number") return 1;
  if (type === "boolean") return true;
  return `<${name}>`;
}

export function examples(openapi, found, req) {
  const { path, method, op, item } = found;
  const M = method.toUpperCase();
  const params = parameterList(openapi, item, op);
  const pathParams = params.filter((p) => p.in === "path").map((p) => p.name);
  const query = params.filter((p) => p.in === "query" && p.required);
  const curlPath = path.replace(/\{([^}]+)\}/g, (_, n) => placeholder(n));
  const tsPath = path.replace(/\{([^}]+)\}/g, (_, n) => `\${${n}}`);
  const pyPath = path.replace(/\{([^}]+)\}/g, (_, n) => `{${snake(n)}}`);
  const queryString = query.length ? `?${query.map((q) => `${q.name}=${placeholder(q.name)}`).join("&")}` : "";
  const body = exampleBody(openapi, op);
  const form = !!op.requestBody?.content?.["application/x-www-form-urlencoded"] && !op.requestBody?.content?.["application/json"];
  const sdk = SDK[op.operationId];
  const auth = req.kind === "service" || req.kind === "person" || path === "/oauth/userinfo";
  const out = {};

  const curl = [`curl -s -X ${M} "$API${curlPath}${queryString}"`];
  if (auth) curl.push(`  -H "Authorization: Bearer $TOKEN"`);
  const idempotent = params.some((p) => p.name === "Idempotency-Key");
  if (idempotent) curl.push(`  -H "Idempotency-Key: $(uuidgen)"`);
  if (path === "/oauth/token" || path === "/oauth/revoke") curl.push(`  -u "$MIROTARACT_CLIENT_ID:$MIROTARACT_CLIENT_SECRET"`, path === "/oauth/token" ? "  -d grant_type=client_credentials" : "  -d token=\"$REFRESH_TOKEN\"");
  else if (body && !form) curl.push(`  -H "Content-Type: application/json"`, `  -d '${JSON.stringify(body)}'`);
  out.curl = [
    `API=${API}`,
    ...(req.kind === "service" ? [`TOKEN=$(curl -s -u "$MIROTARACT_CLIENT_ID:$MIROTARACT_CLIENT_SECRET" -d grant_type=client_credentials${req.scope ? ` --data-urlencode "scope=${req.scope}"` : ""} "$API/oauth/token" | jq -r .access_token)`] : []),
    curl.join(" \\\n"),
  ].join("\n");

  if (sdk) {
    out.typescript = [
      `import { MiRotaract } from "@mirotaract/sdk"; // solo servidor`,
      "",
      "const client = new MiRotaract({",
      "  baseUrl: process.env.MIROTARACT_BASE_URL!,",
      "  clientId: process.env.MIROTARACT_CLIENT_ID!,",
      "  clientSecret: process.env.MIROTARACT_CLIENT_SECRET!,",
      ...(req.scope ? [`  scope: [${JSON.stringify(req.scope)}],`] : []),
      "});",
      sdk.paginated ? `for await (const item of ${sdk.ts}) {\n  // …\n}` : `const result = ${sdk.ts};`,
    ].join("\n");
    out.python = [
      "import os",
      "from mirotaract import MiRotaract  # AsyncMiRotaract en código async",
      "",
      "client = MiRotaract(",
      '    os.environ["MIROTARACT_BASE_URL"],',
      '    os.environ["MIROTARACT_CLIENT_ID"],',
      '    os.environ["MIROTARACT_CLIENT_SECRET"],',
      ...(req.scope ? [`    scope=[${JSON.stringify(req.scope)}],`] : []),
      ")",
      sdk.paginated ? `for item in ${sdk.py}:\n    ...` : `result = ${sdk.py}`,
    ].join("\n");
  } else {
    const headers = [];
    if (auth) headers.push("authorization: `Bearer ${token}`");
    if (idempotent) headers.push('"idempotency-key": crypto.randomUUID()');
    if (body && !form) headers.push('"content-type": "application/json"');
    out.typescript = [
      `const response = await fetch(\`\${process.env.MIROTARACT_BASE_URL}${tsPath}${queryString ? queryString.replace(/\$([A-Z_]+)/g, "${$1}") : ""}\`, {`,
      `  method: "${M}",`,
      ...(headers.length ? [`  headers: { ${headers.join(", ")} },`] : []),
      ...(body && !form ? [`  body: JSON.stringify(${JSON.stringify(body)}),`] : []),
      "});",
      "if (!response.ok) throw new Error(`HTTP ${response.status}`); // no vuelques el cuerpo ni el token a los logs",
      "const data = await response.json();",
    ].join("\n");
    out.python = [
      "import os",
      ...(idempotent ? ["import uuid"] : []),
      "import httpx",
      "",
      `response = httpx.request(`,
      `    "${M}",`,
      `    f"{os.environ['MIROTARACT_BASE_URL']}${pyPath}",`,
      ...(auth || idempotent
        ? [`    headers={${[auth ? '"Authorization": f"Bearer {token}"' : null, idempotent ? '"Idempotency-Key": str(uuid.uuid4())' : null].filter(Boolean).join(", ")}},`]
        : []),
      ...(body && !form ? [`    json=${JSON.stringify(body).replace(/true/g, "True").replace(/false/g, "False").replace(/null/g, "None")},`] : []),
      ")",
      "response.raise_for_status()",
      "data = response.json()",
    ].join("\n");
  }
  if (pathParams.length) out.note = `Parámetros de ruta: ${pathParams.map((p) => `\`${p}\``).join(", ")}.`;
  return out;
}

/** Markdown description of one operation. */
export function describeOperation(openapi, found, endpointScopes = {}) {
  const { path, method, op, item } = found;
  const req = requirement({ ...op, method }, path, endpointScopes);
  const params = parameterList(openapi, item, op);
  const lines = [
    `# \`${method.toUpperCase()} ${path}\` · \`${op.operationId}\``,
    "",
    `**${op.summary ?? ""}**${op.tags?.length ? ` (tag \`${op.tags.join("`, `")}\`)` : ""}`,
    ...(op.description ? ["", op.description.trim()] : []),
    "",
    `Base: \`${API}\` (local: \`http://localhost:54321/api/kernel/v1\`).`,
    "",
    "## Qué necesita",
    "",
    req.text,
    ...(op.deprecated ? ["", "**Deprecada.**"] : []),
  ];
  if (params.length) {
    lines.push("", "## Parámetros", "", "| Nombre | En | Obligatorio | Tipo | Descripción |", "|---|---|---|---|---|");
    for (const p of params)
      lines.push(`| \`${p.name}\` | ${p.in} | ${p.required ? "sí" : "no"} | ${schemaLabel(openapi, p.schema)} | ${(p.description ?? "").replace(/\s+/g, " ").replace(/\|/g, "\\|")} |`);
  }
  if (op.requestBody) {
    const [mediaType, media] = Object.entries(op.requestBody.content ?? {})[0] ?? [];
    lines.push("", "## Cuerpo", "", `\`${mediaType}\`${op.requestBody.required ? " (obligatorio)" : ""}:`, "", "```json", JSON.stringify(inlineSchema(openapi, media?.schema, 2), null, 2), "```");
  }
  lines.push("", "## Respuestas", "");
  for (const [status, response] of Object.entries(op.responses ?? {})) {
    const resolved = response.$ref ? resolveRef(openapi, response.$ref) : response;
    const [mediaType, media] = Object.entries(resolved?.content ?? {})[0] ?? [];
    lines.push(`- **${status}**: ${resolved?.description?.trim() ?? ""}${media ? ` → \`${schemaLabel(openapi, media.schema)}\` (${mediaType})` : ""}`);
  }
  const success = Object.entries(op.responses ?? {}).find(([s]) => s.startsWith("2"));
  const successMedia = success && Object.values((success[1].$ref ? resolveRef(openapi, success[1].$ref) : success[1])?.content ?? {})[0];
  if (successMedia?.schema) lines.push("", "### Esquema de la respuesta exitosa", "", "```json", JSON.stringify(inlineSchema(openapi, successMedia.schema, 2), null, 2), "```");
  const ex = examples(openapi, found, req);
  lines.push("", "## Ejemplos", "", "TypeScript:", "", "```ts", ex.typescript, "```", "", "Python:", "", "```python", ex.python, "```", "", "curl:", "", "```bash", ex.curl, "```");
  if (ex.note) lines.push("", ex.note);
  return { markdown: lines.join("\n"), requirement: req };
}
