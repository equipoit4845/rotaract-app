import type { JsonSchemaNode } from "@/lib/api";

/**
 * Pure helpers behind the configuration form generated from a module's
 * `configurationSchema`. The Kernel is the one that validates (and answers
 * with Spanish errors per field); the form only pre-fills defaults and
 * catches empty required fields before sending.
 */

export type FieldErrors = Record<string, string>;
export type ConfigValue = Record<string, unknown>;

export function schemaType(schema: JsonSchemaNode | undefined): string {
  const type = schema?.type;
  if (Array.isArray(type)) return type.find((t) => t !== "null") ?? "string";
  if (type) return type;
  if (schema?.enum)
    return typeof schema.enum[0] === "number" ? "number" : "string";
  if (schema?.properties) return "object";
  return "string";
}

/** `votosPorClub` → "Votos por club" when the schema has no title. */
export function humanize(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function fieldLabel(key: string, schema: JsonSchemaNode): string {
  return schema.title?.trim() || humanize(key);
}

/** Same paths the Kernel uses in `errors[].path`: `a.b`, `list[0].c`. */
export function childPath(parent: string, key: string | number): string {
  if (typeof key === "number") return `${parent}[${key}]`;
  return parent ? `${parent}.${key}` : key;
}

function isPlainObject(value: unknown): value is ConfigValue {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Saved configuration (or {}) with the schema's defaults filled in. */
export function withDefaults(
  schema: JsonSchemaNode | null | undefined,
  value: unknown,
): ConfigValue {
  const base: ConfigValue = isPlainObject(value) ? { ...value } : {};
  for (const [key, child] of Object.entries(schema?.properties ?? {})) {
    if (base[key] === undefined && child.default !== undefined)
      base[key] = structuredClone(child.default);
    if (
      schemaType(child) === "object" &&
      (base[key] !== undefined || child.properties)
    )
      base[key] = withDefaults(child, base[key]);
  }
  return base;
}

function isEmpty(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "") ||
    (Array.isArray(value) && value.length === 0)
  );
}

/** Required fields left empty, as `{ path: "Falta completar «Título»." }`. */
export function missingRequired(
  schema: JsonSchemaNode | null | undefined,
  value: unknown,
  parent = "",
): FieldErrors {
  const errors: FieldErrors = {};
  const object = isPlainObject(value) ? value : {};
  for (const key of schema?.required ?? []) {
    const child = schema?.properties?.[key] ?? {};
    if (schemaType(child) !== "boolean" && isEmpty(object[key]))
      errors[childPath(parent, key)] =
        `Falta completar «${fieldLabel(key, child)}».`;
  }
  for (const [key, child] of Object.entries(schema?.properties ?? {}))
    if (schemaType(child) === "object" && isPlainObject(object[key]))
      Object.assign(
        errors,
        missingRequired(child, object[key], childPath(parent, key)),
      );
  return errors;
}

/**
 * Drops empty optional strings/arrays so "left blank" means "not set"
 * (the schema may have a format or a minLength that "" would fail).
 */
export function compact(
  schema: JsonSchemaNode | null | undefined,
  value: ConfigValue,
): ConfigValue {
  const out: ConfigValue = {};
  for (const [key, item] of Object.entries(value)) {
    const child = schema?.properties?.[key];
    if (item === undefined || (typeof item === "string" && item === ""))
      continue;
    if (child && schemaType(child) === "object" && isPlainObject(item))
      out[key] = compact(child, item);
    else out[key] = item;
  }
  return out;
}

/** Kernel `errors[]` → `{ path: message }` (first message per field). */
export function errorsByPath(
  errors: ReadonlyArray<{ path: string; message: string }>,
): FieldErrors {
  const out: FieldErrors = {};
  for (const error of errors) out[error.path] ??= error.message;
  return out;
}

/** The HTML input type for a string field. */
export function inputType(schema: JsonSchemaNode): string {
  switch (schema.format) {
    case "email":
      return "email";
    case "uri":
    case "url":
      return "url";
    case "date":
      return "date";
    case "time":
      return "time";
    default:
      return "text";
  }
}
