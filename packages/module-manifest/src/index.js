import Ajv from "ajv";
import addFormats from "ajv-formats";
import { createRequire } from "node:module";

import {
  describeAjvErrors,
  pointerToPath,
  summarizeErrors,
} from "./errors-es.js";

const require = createRequire(import.meta.url);

/** JSON Schema (draft-07) of mirotaract.module.json, v1. */
export const manifestSchema = require("../schema/module-manifest.v1.json");

export const MANIFEST_SCHEMA_URL = manifestSchema.$id;
export const MANIFEST_FILE_NAME = "mirotaract.module.json";
export const CONTRACT_VERSION = 1;

/** Namespaces no module may use (they belong to the platform). */
export const RESERVED_MODULE_IDS = Object.freeze([
  ...manifestSchema.properties.id.not.enum,
]);

export { describeAjvErrors, pointerToPath, summarizeErrors };

function createAjv(extra = {}) {
  // verbose: parentSchema (title) for the Spanish messages.
  const ajv = new Ajv({ allErrors: true, strict: false, verbose: true, ...extra });
  addFormats(ajv);
  return ajv;
}

const manifestAjv = createAjv();
const validateShape = manifestAjv.compile(manifestSchema);

/** Ajv instance used to compile configuration schemas (shared cache). */
const configurationAjv = createAjv({ useDefaults: true });
const compiledConfigurations = new WeakMap();

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isLocalhost(url) {
  try {
    const { hostname } = new URL(url);
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]" ||
      hostname.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

/** "reuniones.meeting.manage" → "reuniones". */
export function permissionNamespace(code) {
  return String(code).split(".")[0];
}

/** True when `code` belongs to the module `moduleId` (`<moduleId>.<...>`). */
export function isModulePermission(moduleId, code) {
  return (
    typeof code === "string" &&
    typeof moduleId === "string" &&
    moduleId.length > 0 &&
    code.startsWith(`${moduleId}.`) &&
    code.length > moduleId.length + 1
  );
}

/**
 * Compiles a configuration schema. Returns the validate function, or the
 * Spanish reason it can't be used.
 */
export function compileConfigurationSchema(schema) {
  if (!isPlainObject(schema))
    return { ok: false, error: "El esquema de configuración tiene que ser un objeto JSON Schema." };
  const cached = compiledConfigurations.get(schema);
  if (cached) return { ok: true, validate: cached };
  if (schema.type !== undefined && schema.type !== "object")
    return { ok: false, error: "La raíz del esquema de configuración tiene que ser de tipo \"object\"." };
  try {
    const validate = configurationAjv.compile(schema);
    compiledConfigurations.set(schema, validate);
    return { ok: true, validate };
  } catch (error) {
    return {
      ok: false,
      error: `El esquema de configuración no es un JSON Schema válido: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Validates a manifest. Never throws.
 *
 * @param {unknown} manifest
 * @param {{ knownEventTypes?: readonly string[] }} [options]
 *   knownEventTypes: public event types that exist (for `events.subscribes`).
 * @returns {{ ok: boolean, errors: Array<{ path: string, message: string, keyword: string }>, manifest?: object }}
 */
export function validateManifest(manifest, options = {}) {
  if (!isPlainObject(manifest))
    return {
      ok: false,
      errors: [
        { path: "", message: "El manifiesto tiene que ser un objeto JSON.", keyword: "type" },
      ],
    };
  const errors = [];
  if (!validateShape(manifest))
    errors.push(...describeAjvErrors(validateShape.errors, "El manifiesto"));

  const id = typeof manifest.id === "string" ? manifest.id : "";
  const permissions = Array.isArray(manifest.permissions)
    ? manifest.permissions
    : [];
  const seen = new Map();
  permissions.forEach((permission, index) => {
    const code = isPlainObject(permission) ? permission.code : undefined;
    if (typeof code !== "string") return;
    if (id && !isModulePermission(id, code))
      errors.push({
        path: `permissions[${index}].code`,
        message: `El permiso «${code}» tiene que empezar con «${id}.»: cada módulo solo define permisos en su propio espacio de nombres.`,
        keyword: "namespace",
      });
    if (seen.has(code))
      errors.push({
        path: `permissions[${index}].code`,
        message: `El permiso «${code}» está repetido (también en permissions[${seen.get(code)}]).`,
        keyword: "uniqueCode",
      });
    else seen.set(code, index);
  });

  const events = isPlainObject(manifest.events) ? manifest.events : {};
  if (Array.isArray(events.emits))
    events.emits.forEach((type, index) => {
      if (typeof type === "string" && id && !type.startsWith(`${id}.`))
        errors.push({
          path: `events.emits[${index}]`,
          message: `El evento «${type}» tiene que empezar con «${id}.»: un módulo solo publica eventos propios.`,
          keyword: "namespace",
        });
    });
  if (Array.isArray(events.subscribes) && options.knownEventTypes) {
    const known = new Set(options.knownEventTypes);
    events.subscribes.forEach((type, index) => {
      if (typeof type === "string" && !known.has(type))
        errors.push({
          path: `events.subscribes[${index}]`,
          message: `El evento «${type}» no existe en el catálogo de Mi Rotaract.`,
          keyword: "knownEvent",
        });
    });
  }

  if (manifest.configurationSchema !== undefined) {
    const compiled = compileConfigurationSchema(manifest.configurationSchema);
    if (!compiled.ok)
      errors.push({
        path: "configurationSchema",
        message: compiled.error,
        keyword: "configurationSchema",
      });
  }

  const entryUrl = isPlainObject(manifest.ui) ? manifest.ui.entryUrl : undefined;
  if (
    typeof entryUrl === "string" &&
    entryUrl.startsWith("http://") &&
    !isLocalhost(entryUrl)
  )
    errors.push({
      path: "ui.entryUrl",
      message: "La dirección de entrada tiene que usar https (http solo se acepta para localhost).",
      keyword: "https",
    });

  return errors.length
    ? { ok: false, errors }
    : { ok: true, errors: [], manifest };
}

/**
 * Validates a club's configuration against a module's
 * `configurationSchema`. Applies the schema's defaults to a copy.
 *
 * @returns {{ ok: boolean, errors: Array<{ path: string, message: string, keyword: string }>, value?: object }}
 */
export function validateConfiguration(schema, value) {
  if (schema === undefined || schema === null)
    return isPlainObject(value) || value === undefined || value === null
      ? { ok: true, errors: [], value: value ?? {} }
      : {
          ok: false,
          errors: [{ path: "", message: "La configuración tiene que ser un objeto.", keyword: "type" }],
        };
  const compiled = compileConfigurationSchema(schema);
  if (!compiled.ok)
    return { ok: false, errors: [{ path: "", message: compiled.error, keyword: "configurationSchema" }] };
  const copy = value === undefined || value === null ? {} : structuredClone(value);
  if (compiled.validate(copy)) return { ok: true, errors: [], value: copy };
  return {
    ok: false,
    errors: describeAjvErrors(compiled.validate.errors, "La configuración"),
  };
}
