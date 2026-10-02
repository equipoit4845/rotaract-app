/**
 * Small, dependency-free code generators for `mirotaract gen types`:
 * - event catalog → TypeScript types and Python TypedDicts;
 * - OpenAPI components.schemas → Python TypedDicts.
 * (TypeScript for the OpenAPI contract comes from openapi-typescript.)
 */

const PY_KEYWORDS = new Set(
  "False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield".split(
    " ",
  ),
);

export function pascalCase(value) {
  const name = String(value)
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  return /^[0-9]/.test(name) ? `T${name}` : name || "Unnamed";
}

/**
 * The catalog shape is owned by the kernel (E7). Accept the reasonable
 * variants: an array, or { items | events | types | data: [...] }; each
 * entry with type|name|eventType, description, version, example|examplePayload|payload,
 * and optionally schema|dataSchema (JSON Schema of `data`).
 */
export function normalizeCatalog(json) {
  const list = Array.isArray(json)
    ? json
    : (json?.items ?? json?.events ?? json?.types ?? json?.data ?? []);
  if (!Array.isArray(list)) return [];
  return list
    .map((entry) => {
      if (typeof entry === "string") return { type: entry };
      const type = entry?.type ?? entry?.name ?? entry?.eventType;
      if (typeof type !== "string" || !type) return null;
      let example = entry.example ?? entry.examplePayload ?? entry.payload;
      // An example may be the whole envelope or just `data`.
      const isEnvelope =
        example &&
        typeof example === "object" &&
        !Array.isArray(example) &&
        "data" in example &&
        "type" in example;
      const data = isEnvelope ? example.data : example;
      return {
        type,
        description:
          typeof entry.description === "string" ? entry.description : undefined,
        version: entry.version,
        schema:
          entry.dataSchema ?? entry.schema?.properties?.data ?? entry.schema,
        example: data,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.type.localeCompare(b.type));
}

/** Best-effort JSON Schema from an example value. */
export function schemaFromExample(value) {
  if (value === null) return { type: "null" };
  if (Array.isArray(value))
    return {
      type: "array",
      items: value.length ? schemaFromExample(value[0]) : {},
    };
  switch (typeof value) {
    case "string":
      return { type: "string" };
    case "number":
      return { type: Number.isInteger(value) ? "integer" : "number" };
    case "boolean":
      return { type: "boolean" };
    case "object": {
      const properties = {};
      for (const [key, child] of Object.entries(value))
        properties[key] = schemaFromExample(child);
      return { type: "object", properties, required: Object.keys(value) };
    }
    default:
      return {};
  }
}

function eventDataSchema(event) {
  if (event.schema && typeof event.schema === "object") return event.schema;
  if (event.example !== undefined) return schemaFromExample(event.example);
  return { type: "object", additionalProperties: true };
}

function types(schema) {
  if (Array.isArray(schema.type)) return schema.type;
  return schema.type ? [schema.type] : [];
}

function tsKey(key) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
}

/** JSON Schema (subset) → TypeScript type expression. */
export function schemaToTs(schema, indent = "") {
  if (!schema || typeof schema !== "object" || Object.keys(schema).length === 0)
    return "unknown";
  if (schema.$ref) return pascalCase(schema.$ref.split("/").pop());
  if (schema.const !== undefined) return JSON.stringify(schema.const);
  if (Array.isArray(schema.enum))
    return schema.enum.map((v) => JSON.stringify(v)).join(" | ");
  const variants = schema.oneOf ?? schema.anyOf;
  if (Array.isArray(variants))
    return variants.map((v) => schemaToTs(v, indent)).join(" | ");
  if (Array.isArray(schema.allOf))
    return schema.allOf.map((v) => schemaToTs(v, indent)).join(" & ");
  const list = types(schema);
  const parts = (
    list.length ? list : [schema.properties ? "object" : "unknown"]
  ).map((type) => {
    switch (type) {
      case "string":
        return "string";
      case "integer":
      case "number":
        return "number";
      case "boolean":
        return "boolean";
      case "null":
        return "null";
      case "array":
        return `Array<${schemaToTs(schema.items, indent)}>`;
      case "object": {
        const required = new Set(schema.required ?? []);
        const inner = `${indent}  `;
        const lines = Object.entries(schema.properties ?? {}).map(
          ([key, child]) =>
            `${inner}${tsKey(key)}${required.has(key) ? "" : "?"}: ${schemaToTs(child, inner)};`,
        );
        if (schema.additionalProperties)
          lines.push(
            `${inner}[key: string]: ${schema.additionalProperties === true ? "unknown" : schemaToTs(schema.additionalProperties, inner)};`,
          );
        return lines.length
          ? `{\n${lines.join("\n")}\n${indent}}`
          : "Record<string, unknown>";
      }
      default:
        return "unknown";
    }
  });
  if (schema.nullable && !parts.includes("null")) parts.push("null");
  return parts.join(" | ");
}

export function eventsToTs(catalog) {
  const lines = [
    "",
    "// ---------------------------------------------------------------------------",
    "// Catálogo de eventos (GET /events/catalog). Ver docs/developers/ del kernel.",
    "// ---------------------------------------------------------------------------",
    "",
    "/** Sobre común de todo webhook de Mi Rotaract. */",
    "export interface MiRotaractEventEnvelope<TType extends string = string, TData = unknown> {",
    "  /** evt_…: estable entre reintentos; deduplicá por este id. */",
    "  id: string;",
    "  type: TType;",
    "  createdAt: string;",
    "  organizationId: string;",
    "  data: TData;",
    "}",
    "",
  ];
  const names = [];
  for (const event of catalog) {
    const name = `${pascalCase(event.type)}Event`;
    names.push([event.type, name]);
    if (event.description)
      lines.push(`/** ${event.description.replace(/\*\//g, "*\\/")} */`);
    lines.push(
      `export type ${name} = MiRotaractEventEnvelope<${JSON.stringify(event.type)}, ${schemaToTs(eventDataSchema(event))}>;`,
      "",
    );
  }
  lines.push(
    `export type MiRotaractEvent = ${names.length ? names.map(([, n]) => n).join(" | ") : "MiRotaractEventEnvelope"};`,
    'export type MiRotaractEventType = MiRotaractEvent["type"];',
    "export interface MiRotaractEventMap {",
    ...names.map(([type, name]) => `  ${JSON.stringify(type)}: ${name};`),
    "}",
    "",
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------- Python

function pyName(name) {
  const clean = pascalCase(name);
  return PY_KEYWORDS.has(clean) ? `${clean}_` : clean;
}

/** JSON Schema → Python type expression (references quoted as forward refs). */
export function schemaToPy(schema, ctx) {
  if (!schema || typeof schema !== "object" || Object.keys(schema).length === 0)
    return "Any";
  if (schema.$ref) return JSON.stringify(pyName(schema.$ref.split("/").pop()));
  if (schema.const !== undefined) return `Literal[${pyLiteral(schema.const)}]`;
  if (Array.isArray(schema.enum)) {
    const nonNull = schema.enum.filter((v) => v !== null);
    const literal = nonNull.length
      ? `Literal[${nonNull.map(pyLiteral).join(", ")}]`
      : "None";
    return schema.enum.includes(null) && nonNull.length
      ? `Optional[${literal}]`
      : literal;
  }
  const variants = schema.oneOf ?? schema.anyOf;
  if (Array.isArray(variants))
    return union(variants.map((v) => schemaToPy(v, ctx)));
  if (Array.isArray(schema.allOf)) {
    if (schema.allOf.length === 1) return schemaToPy(schema.allOf[0], ctx);
    return schemaToPy(mergeAllOf(schema, ctx), ctx);
  }
  const list = types(schema);
  const parts = (
    list.length ? list : [schema.properties ? "object" : "any"]
  ).map((type) => {
    switch (type) {
      case "string":
        return "str";
      case "integer":
        return "int";
      case "number":
        return "float";
      case "boolean":
        return "bool";
      case "null":
        return "None";
      case "array":
        return `List[${schemaToPy(schema.items, ctx)}]`;
      case "object":
        if (schema.properties && Object.keys(schema.properties).length) {
          const name = ctx.uniqueName(ctx.hint ?? "Inline");
          ctx.emitClass(name, schema);
          return JSON.stringify(name);
        }
        if (schema.additionalProperties && schema.additionalProperties !== true)
          return `Dict[str, ${schemaToPy(schema.additionalProperties, ctx)}]`;
        return "Dict[str, Any]";
      default:
        return "Any";
    }
  });
  if (schema.nullable && !parts.includes("None")) parts.push("None");
  return union(parts);
}

function mergeAllOf(schema, ctx) {
  const merged = { type: "object", properties: {}, required: [] };
  for (const part of schema.allOf) {
    const resolved = part.$ref ? ctx.resolve(part.$ref) : part;
    if (!resolved) continue;
    Object.assign(merged.properties, resolved.properties ?? {});
    merged.required.push(...(resolved.required ?? []));
  }
  return merged;
}

function union(parts) {
  const unique = [...new Set(parts)];
  const hasNone = unique.includes("None");
  const rest = unique.filter((p) => p !== "None");
  if (rest.length === 0) return "None";
  const core = rest.length === 1 ? rest[0] : `Union[${rest.join(", ")}]`;
  return hasNone ? `Optional[${core}]` : core;
}

function pyLiteral(value) {
  if (value === true) return "True";
  if (value === false) return "False";
  if (value === null) return "None";
  return JSON.stringify(value);
}

function isIdentifier(key) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && !PY_KEYWORDS.has(key);
}

class PyEmitter {
  constructor(components = {}) {
    this.components = components;
    this.blocks = [];
    this.used = new Set(Object.keys(components).map(pyName));
  }

  resolve(ref) {
    const name = ref.split("/").pop();
    return this.components[name];
  }

  uniqueName(base) {
    let name = pyName(base);
    let n = 2;
    while (this.used.has(name)) name = `${pyName(base)}${n++}`;
    this.used.add(name);
    return name;
  }

  ctx(hint) {
    return {
      hint,
      uniqueName: (b) => this.uniqueName(b),
      emitClass: (name, schema) => this.emitClass(name, schema),
      resolve: (ref) => this.resolve(ref),
    };
  }

  emitClass(name, schema, doc) {
    const required = new Set(schema.required ?? []);
    const fields = Object.entries(schema.properties ?? {}).map(
      ([key, child]) => {
        const type = schemaToPy(child, this.ctx(`${name}${pascalCase(key)}`));
        return [key, required.has(key) ? type : `NotRequired[${type}]`];
      },
    );
    const description = doc ?? schema.description;
    if (fields.every(([key]) => isIdentifier(key))) {
      this.blocks.push(
        [
          `class ${name}(TypedDict):`,
          ...(description
            ? [
                `    """${String(description).replace(/"""/g, "'''").split("\n")[0]}"""`,
              ]
            : []),
          ...(fields.length
            ? fields.map(([key, type]) => `    ${key}: ${type}`)
            : ["    pass"]),
        ].join("\n"),
      );
    } else {
      this.blocks.push(
        `${name} = TypedDict(${JSON.stringify(name)}, {\n${fields
          .map(([key, type]) => `    ${JSON.stringify(key)}: ${type},`)
          .join("\n")}\n})`,
      );
    }
  }

  emitSchema(rawName, schema) {
    const name = pyName(rawName);
    const isObject =
      schema &&
      (schema.properties ||
        (types(schema).includes("object") && !schema.additionalProperties)) &&
      !schema.oneOf &&
      !schema.anyOf &&
      !schema.enum;
    if (isObject) this.emitClass(name, schema);
    else if (schema?.allOf && schema.allOf.length > 1)
      this.emitClass(name, mergeAllOf(schema, this.ctx(name)));
    else this.blocks.push(`${name} = ${schemaToPy(schema, this.ctx(name))}`);
  }
}

const PY_HEADER = [
  "import sys",
  "from typing import Any, Dict, List, Literal, Optional, Union",
  "",
  "if sys.version_info >= (3, 11):",
  "    from typing import NotRequired, TypedDict",
  "else:  # pragma: no cover",
  "    from typing_extensions import NotRequired, TypedDict",
];

/** OpenAPI document + event catalog → one Python module of TypedDicts. */
export function generatePython(spec, catalog, { source } = {}) {
  const components = spec?.components?.schemas ?? {};
  const emitter = new PyEmitter(components);
  for (const [name, schema] of Object.entries(components))
    emitter.emitSchema(name, schema);

  const eventBlocks = [];
  const eventNames = [];
  if (catalog.length) {
    for (const event of catalog) {
      const base = pascalCase(event.type);
      const dataName = emitter.uniqueName(`${base}Data`);
      const schema = eventDataSchema(event);
      if (schema.properties)
        emitter.emitClass(dataName, schema, event.description);
      else
        emitter.blocks.push(
          `${dataName} = ${schemaToPy(schema, emitter.ctx(dataName))}`,
        );
      const eventName = emitter.uniqueName(`${base}Event`);
      eventNames.push([event.type, eventName]);
      eventBlocks.push(
        [
          `class ${eventName}(TypedDict):`,
          ...(event.description
            ? [
                `    """${event.description.replace(/"""/g, "'''").split("\n")[0]}"""`,
              ]
            : []),
          "    id: str",
          `    type: Literal[${JSON.stringify(event.type)}]`,
          "    createdAt: str",
          "    organizationId: str",
          `    data: ${JSON.stringify(dataName)}`,
        ].join("\n"),
      );
    }
  }
  const footer = [];
  if (eventNames.length) {
    footer.push(
      `MiRotaractEvent = ${union(eventNames.map(([, n]) => JSON.stringify(n)))}`,
      `MiRotaractEventType = Literal[${eventNames.map(([t]) => JSON.stringify(t)).join(", ")}]`,
      `EVENT_TYPES: Dict[str, Any] = {\n${eventNames.map(([t, n]) => `    ${JSON.stringify(t)}: ${n},`).join("\n")}\n}`,
    );
  }
  return [
    `"""Tipos de Mi Rotaract generados por \`mirotaract gen types --lang python\`.`,
    "",
    `Fuente: ${source ?? "kernel-openapi.yaml"} y GET /events/catalog. No editar a mano.`,
    '"""',
    "",
    ...PY_HEADER,
    "",
    "",
    [...emitter.blocks, ...eventBlocks, ...footer].join("\n\n\n"),
    "",
  ].join("\n");
}
