import spec from "@/generated/openapi.json";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Schema = Record<string, any>;

export type Parameter = {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required: boolean;
  description?: string;
  schema?: Schema;
};

export type AuthKind = "user" | "service" | "client" | "oidc" | "none";

export type ResponseInfo = {
  status: string;
  description: string;
  contentType?: string;
  schema?: Schema;
};

export type Operation = {
  method: string;
  path: string;
  operationId: string;
  tag: string;
  summary: string;
  description: string;
  deprecated: boolean;
  deprecatedAt?: string;
  sunset?: string;
  permission: string | null;
  auth: AuthKind[];
  parameters: Parameter[];
  requestBody?: { contentType: string; schema?: Schema; required: boolean };
  responses: ResponseInfo[];
};

export type Tag = {
  name: string;
  slug: string;
  description: string;
  operations: Operation[];
};

const document = spec as unknown as {
  info?: { version?: string; title?: string };
  tags?: Array<{ name: string; description?: string }>;
  security?: Array<Record<string, unknown>>;
  paths?: Record<string, Record<string, any>>;
  components?: Record<string, Record<string, any>>;
};

export const contractVersion = document.info?.version ?? "";
const METHODS = ["get", "post", "put", "patch", "delete"];

/** Follows `#/components/...` references (one level at a time, cycle-safe). */
export function resolveRef<T = Schema>(value: any, depth = 0): T {
  if (!value || typeof value !== "object" || typeof value.$ref !== "string")
    return value;
  if (depth > 10) return {} as T;
  const target = value.$ref
    .replace(/^#\//, "")
    .split("/")
    .reduce((node: any, part: string) => node?.[part], document);
  return resolveRef<T>(target ?? {}, depth + 1);
}

export function refName(value: any): string | undefined {
  return typeof value?.$ref === "string"
    ? value.$ref.split("/").pop()
    : undefined;
}

const SCHEME_KIND: Record<string, AuthKind> = {
  bearerAuth: "user",
  serviceAuth: "service",
  clientBasic: "client",
  oidcAccessToken: "oidc",
};

function authOf(operation: any): AuthKind[] {
  const security = (operation.security ?? document.security ?? []) as Array<
    Record<string, unknown>
  >;
  if (security.length === 0) return ["none"];
  const kinds = security.flatMap((requirement) =>
    Object.keys(requirement).map((name) => SCHEME_KIND[name] ?? "user"),
  );
  return kinds.length ? [...new Set(kinds)] : ["none"];
}

function contentOf(
  container: any,
): { contentType: string; schema?: Schema } | undefined {
  const content = container?.content as Record<string, any> | undefined;
  if (!content) return undefined;
  const [contentType, media] = Object.entries(content)[0] ?? [];
  return contentType ? { contentType, schema: media?.schema } : undefined;
}

function toOperation(
  path: string,
  method: string,
  raw: any,
  inherited: any[],
): Operation {
  const parameters = [...inherited, ...(raw.parameters ?? [])]
    .map((parameter) => resolveRef<any>(parameter))
    .filter((parameter) => parameter?.name && parameter?.in)
    .map((parameter) => ({
      name: parameter.name,
      in: parameter.in,
      required: Boolean(parameter.required || parameter.in === "path"),
      description: parameter.description,
      schema: parameter.schema,
    }));
  const body = raw.requestBody ? resolveRef<any>(raw.requestBody) : undefined;
  const bodyContent = contentOf(body);
  const responses = Object.entries(raw.responses ?? {}).map(
    ([status, value]) => {
      const response = resolveRef<any>(value);
      const content = contentOf(response);
      return {
        status,
        description: response?.description ?? "",
        contentType: content?.contentType,
        schema: content?.schema,
      };
    },
  );
  return {
    method: method.toUpperCase(),
    path,
    operationId: raw.operationId,
    tag: raw.tags?.[0] ?? "Otros",
    summary: raw.summary ?? raw.operationId,
    description: raw.description ?? "",
    deprecated: Boolean(raw.deprecated),
    deprecatedAt: raw["x-deprecated-at"],
    sunset: raw["x-sunset"],
    permission: raw["x-required-permission"] ?? null,
    auth: authOf(raw),
    parameters,
    requestBody: bodyContent
      ? { ...bodyContent, required: Boolean(body?.required) }
      : undefined,
    responses,
  };
}

export function allOperations(): Operation[] {
  const operations: Operation[] = [];
  for (const [path, item] of Object.entries(document.paths ?? {})) {
    for (const method of METHODS) {
      const raw = item?.[method];
      if (!raw?.operationId) continue;
      operations.push(toOperation(path, method, raw, item.parameters ?? []));
    }
  }
  return operations;
}

/** Tags in the contract's order, with their operations; empty tags omitted. */
export function allTags(): Tag[] {
  const operations = allOperations();
  const declared = document.tags ?? [];
  const names = [
    ...declared.map((tag) => tag.name),
    ...operations.map((operation) => operation.tag),
  ].filter((name, index, list) => list.indexOf(name) === index);
  return names
    .map((name) => ({
      name,
      slug: name.toLowerCase(),
      description: declared.find((tag) => tag.name === name)?.description ?? "",
      operations: operations.filter((operation) => operation.tag === name),
    }))
    .filter((tag) => tag.operations.length > 0);
}

/** Tags an app developer cares about first; the rest is the platform's own API. */
export const DEVELOPER_TAGS = [
  "OAuth",
  "Service",
  "Events",
  "Webhooks",
  "DeveloperApps",
  "RequestLogs",
  "Modules",
];

// --- Examples from schemas ---------------------------------------------------

const FORMAT_EXAMPLE: Record<string, unknown> = {
  "date-time": "2026-10-04T12:00:00.000Z",
  date: "2026-10-04",
  email: "socia@example.org",
  uri: "https://example.org",
  uuid: "6f1d2c4e-0000-4000-8000-000000000000",
};

/** A plausible example value for a schema (explicit examples win). */
export function exampleFor(
  raw: any,
  depth = 0,
  seen = new Set<string>(),
): unknown {
  if (!raw) return null;
  const name = refName(raw);
  if (name) {
    if (seen.has(name) || depth > 6) return {};
    seen = new Set(seen).add(name);
  }
  const schema = resolveRef<any>(raw);
  if (schema.example !== undefined) return schema.example;
  if (Array.isArray(schema.examples) && schema.examples.length)
    return schema.examples[0];
  if (schema.default !== undefined) return schema.default;
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
  const variants = schema.oneOf ?? schema.anyOf;
  if (Array.isArray(variants) && variants.length)
    return exampleFor(variants[0], depth + 1, seen);
  if (Array.isArray(schema.allOf))
    return Object.assign(
      {},
      ...schema.allOf.map((part: any) => {
        const value = exampleFor(part, depth + 1, seen);
        return value && typeof value === "object" ? value : {};
      }),
    );
  const type = Array.isArray(schema.type)
    ? schema.type.find((t: string) => t !== "null")
    : schema.type;
  if (type === "object" || schema.properties) {
    const out: Record<string, unknown> = {};
    const required = new Set<string>(schema.required ?? []);
    const entries = Object.entries(schema.properties ?? {});
    // Keep examples short: required fields, or the first few if none are.
    const chosen = required.size
      ? entries.filter(([key]) => required.has(key))
      : entries.slice(0, 4);
    for (const [key, value] of chosen)
      out[key] = exampleFor(value, depth + 1, seen);
    return out;
  }
  if (type === "array")
    return depth > 5 ? [] : [exampleFor(schema.items, depth + 1, seen)];
  if (type === "integer" || type === "number") return schema.minimum ?? 1;
  if (type === "boolean") return true;
  if (type === "string")
    return FORMAT_EXAMPLE[schema.format] ?? (schema.pattern ? "…" : "texto");
  return null;
}

// --- Schema tree for display -----------------------------------------------------

export type SchemaNode = {
  name?: string;
  type: string;
  required?: boolean;
  nullable?: boolean;
  description?: string;
  enumValues?: string[];
  ref?: string;
  children?: SchemaNode[];
};

function typeLabel(schema: any): string {
  if (Array.isArray(schema.type)) return schema.type.join(" | ");
  if (schema.type)
    return schema.format ? `${schema.type} (${schema.format})` : schema.type;
  if (schema.properties) return "object";
  if (schema.oneOf || schema.anyOf) return "una de";
  if (schema.allOf) return "object";
  return "any";
}

export function schemaTree(
  raw: any,
  name?: string,
  required?: boolean,
  depth = 0,
  seen = new Set<string>(),
): SchemaNode {
  const ref = refName(raw);
  const schema = resolveRef<any>(raw ?? {});
  const node: SchemaNode = {
    name,
    type:
      typeLabel(schema) === "array"
        ? `${refName(schema.items) ?? typeLabel(resolveRef(schema.items ?? {}))}[]`
        : typeLabel(schema),
    required,
    nullable: Boolean(schema.nullable),
    description: schema.description,
    enumValues: Array.isArray(schema.enum)
      ? schema.enum.map(String)
      : undefined,
    ref,
  };
  if (ref && (seen.has(ref) || depth > 4)) return node;
  const nextSeen = ref ? new Set(seen).add(ref) : seen;
  const target =
    schema.type === "array" ? resolveRef<any>(schema.items ?? {}) : schema;
  const parts = target.allOf
    ? target.allOf.map((part: any) => resolveRef<any>(part))
    : [target];
  const requiredSet = new Set<string>(
    parts.flatMap((part: any) => part.required ?? []),
  );
  const children: SchemaNode[] = [];
  for (const part of parts)
    for (const [key, value] of Object.entries(part.properties ?? {}))
      children.push(
        schemaTree(value, key, requiredSet.has(key), depth + 1, nextSeen),
      );
  const variants = target.oneOf ?? target.anyOf;
  if (Array.isArray(variants))
    variants.forEach((variant: any, index: number) =>
      children.push(
        schemaTree(
          variant,
          `opción ${index + 1}`,
          undefined,
          depth + 1,
          nextSeen,
        ),
      ),
    );
  if (children.length) node.children = children;
  return node;
}
