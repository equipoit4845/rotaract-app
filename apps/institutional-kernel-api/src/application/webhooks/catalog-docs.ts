import {
  EVENT_CATALOG,
  exampleEnvelope,
  type EventDefinition,
  type JsonSchema,
} from "./catalog";

/**
 * Renders docs/developers/catalogo-de-eventos.md from catalog.ts. Run
 * `pnpm docs:events` after changing the catalog; catalog.spec.ts fails
 * while the file is stale.
 */

const SCOPE_LABEL: Record<string, string> = {
  "kernel.service.memberships.read": "Leer el padrón de socios",
  "kernel.service.authorities.read": "Leer autoridades vigentes",
  "kernel.service.organizations.read": "Leer clubes y distrito",
  "kernel.service.persons.read": "Leer datos de personas",
  "kernel.service.periods.read": "Leer períodos",
};

function typeOf(schema: JsonSchema): string {
  const type = schema.type;
  const base = Array.isArray(type)
    ? type.filter((t) => t !== "null").join(" | ") +
      (type.includes("null") ? " (o null)" : "")
    : String(type ?? "object");
  if (Array.isArray(schema.enum))
    return `${base}: ${schema.enum
      .filter((value) => value !== null)
      .map((value) => `\`${value}\``)
      .join(", ")}`;
  if (schema.format) return `${base} (${schema.format})`;
  return base;
}

function fieldRows(schema: JsonSchema, prefix = ""): string[] {
  const properties = (schema.properties ?? {}) as Record<string, JsonSchema>;
  const required = new Set((schema.required ?? []) as string[]);
  const rows: string[] = [];
  for (const [name, property] of Object.entries(properties)) {
    const path = `${prefix}${name}`;
    const isObject = property.type === "object" && property.properties;
    rows.push(
      `| \`${path}\` | ${isObject ? "objeto" : typeOf(property)} | ${required.has(name) ? "sí" : "no"} | ${String(property.description ?? "").replace(/\|/g, "\\|")} |`,
    );
    if (isObject) rows.push(...fieldRows(property, `${path}.`));
  }
  return rows;
}

function section(definition: EventDefinition): string {
  const scope = definition.scope
    ? `\`${definition.scope}\` (${SCOPE_LABEL[definition.scope] ?? definition.scope})`
    : "ninguno";
  return [
    `### \`${definition.type}\` — ${definition.title}`,
    "",
    definition.description,
    "",
    `- **Permiso que necesita la app:** ${scope}`,
    `- **Versión:** ${definition.version}`,
    "",
    "Campos de `data`:",
    "",
    "| Campo | Tipo | Siempre presente | Notas |",
    "|---|---|---|---|",
    ...fieldRows(definition.schema),
    "",
    "Ejemplo del cuerpo que recibís:",
    "",
    "```json",
    JSON.stringify(exampleEnvelope(definition), null, 2),
    "```",
    "",
  ].join("\n");
}

export function renderCatalogMarkdown(): string {
  return [
    "<!-- Generado desde apps/institutional-kernel-api/src/application/webhooks/catalog.ts",
    "     con `pnpm docs:events`. No lo edites a mano. -->",
    "",
    "# Catálogo de eventos",
    "",
    "Los eventos que Mi Rotaract le puede mandar a tu app por webhook. La",
    "misma información, en JSON y con el JSON Schema de cada tipo, está en",
    "`GET /api/kernel/v1/events/catalog` (público, sin autenticación). Cómo",
    "recibirlos y verificarlos: [webhooks.md](webhooks.md).",
    "",
    "Cada tipo lleva su versión (`.v1`). Si alguna vez cambia de forma",
    "incompatible, se publica un tipo nuevo (`.v2`) al lado del anterior; un",
    "campo opcional nuevo no es un cambio incompatible, así que ignorá los",
    "campos que no conozcas.",
    "",
    "Solo recibís eventos de las organizaciones del alcance de tu app (su",
    "club, o el distrito y sus clubes) y solo los tipos para los que la app",
    "tiene permiso. Los datos de contacto (email, teléfono, fecha de",
    "nacimiento) solo aparecen si la app tiene",
    "`kernel.service.persons.contact.read`, igual que en la API de datos.",
    "",
    "| Tipo | Qué pasó | Permiso |",
    "|---|---|---|",
    ...EVENT_CATALOG.map(
      (definition) =>
        `| [\`${definition.type}\`](#${anchor(definition)}) | ${definition.title} | ${definition.scope ? `\`${definition.scope}\`` : "—"} |`,
    ),
    "",
    "Todos los cuerpos tienen la misma forma: `id` (`evt_...`, el mismo en",
    "cada reintento), `type`, `createdAt`, `organizationId` y `data`.",
    "",
    "## Tipos",
    "",
    ...EVENT_CATALOG.map(section),
  ].join("\n");
}

/** GitHub-style anchor of a section heading. */
function anchor(definition: EventDefinition): string {
  return `${definition.type} — ${definition.title}`
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s/g, "-");
}
