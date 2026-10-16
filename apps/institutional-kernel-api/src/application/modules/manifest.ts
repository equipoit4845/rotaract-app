/*
 * Port of packages/module-manifest/src/index.js (validateManifest and
 * validateConfiguration). The kernel image cannot import workspace
 * packages, so this file and module-manifest.schema.ts are kept in sync by
 * manifest.spec.ts, which runs the package's fixtures against both.
 */
import Ajv, { type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";

import { describeAjvErrors, type ValidationError } from "./errors-es";
import { MODULE_MANIFEST_SCHEMA } from "./module-manifest.schema";

export type { ValidationError } from "./errors-es";
export { summarizeErrors } from "./errors-es";

export type ModulePermissionScope = "ORGANIZATION" | "ORGANIZATION_TREE";
export type ModulePermission = {
  code: string;
  name: string;
  description?: string;
  scopeType?: ModulePermissionScope;
};
export type ModulePositionTemplate = {
  key: string;
  name: string;
  description?: string;
  organizationTypes: Array<"CLUB" | "DISTRICT">;
  permissions: string[];
  isSingletonPerPeriod?: boolean;
  install?: "required" | "suggested";
};
export type ModuleGrant = { positionCode: string; permissions: string[] };
export type ModuleManifest = {
  $schema?: string;
  id: string;
  name: string;
  description?: string;
  version: string;
  contractVersion: 1;
  permissions: ModulePermission[];
  positions?: ModulePositionTemplate[];
  grants?: ModuleGrant[];
  events?: { subscribes?: string[]; emits?: string[] };
  configurationSchema?: Record<string, unknown>;
  ui?: { entryUrl: string; navLabel?: string; icon?: string };
  oauth?: { clientId?: string; scopes?: string[] };
  capabilities?: string[];
};

function createAjv(extra: Record<string, unknown> = {}): Ajv {
  const ajv = new Ajv({
    allErrors: true,
    strict: false,
    verbose: true,
    ...extra,
  });
  addFormats(ajv);
  return ajv;
}

const validateShape = createAjv().compile(MODULE_MANIFEST_SCHEMA);
const configurationAjv = createAjv({ useDefaults: true });
// Schemas come from the database (a new object per read), so cache by
// their JSON text instead of by identity.
const compiledConfigurations = new Map<string, ValidateFunction>();
const MAX_COMPILED = 200;

function isPlainObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isLocalhost(url: string): boolean {
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

/** `reuniones.meeting.manage` → `reuniones`. */
export function permissionNamespace(code: string): string {
  return String(code).split(".")[0];
}

/** True when `code` is `<moduleId>.<something>`. */
export function isModulePermission(moduleId: string, code: string): boolean {
  return (
    typeof code === "string" &&
    typeof moduleId === "string" &&
    moduleId.length > 0 &&
    code.startsWith(`${moduleId}.`) &&
    code.length > moduleId.length + 1
  );
}

export function compileConfigurationSchema(
  schema: unknown,
): { ok: true; validate: ValidateFunction } | { ok: false; error: string } {
  if (!isPlainObject(schema))
    return {
      ok: false,
      error: "El esquema de configuración tiene que ser un objeto JSON Schema.",
    };
  if (schema.type !== undefined && schema.type !== "object")
    return {
      ok: false,
      error:
        'La raíz del esquema de configuración tiene que ser de tipo "object".',
    };
  const key = JSON.stringify(schema);
  const cached = compiledConfigurations.get(key);
  if (cached) return { ok: true, validate: cached };
  try {
    const validate = configurationAjv.compile(schema);
    if (compiledConfigurations.size >= MAX_COMPILED)
      compiledConfigurations.clear();
    compiledConfigurations.set(key, validate);
    return { ok: true, validate };
  } catch (error) {
    return {
      ok: false,
      error: `El esquema de configuración no es un JSON Schema válido: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

export type ManifestValidation =
  | { ok: true; errors: []; manifest: ModuleManifest }
  | { ok: false; errors: ValidationError[] };

/** Same rules as `validateManifest` of @mirotaract/module-manifest. */
export function validateManifest(
  manifest: unknown,
  options: { knownEventTypes?: readonly string[] } = {},
): ManifestValidation {
  if (!isPlainObject(manifest))
    return {
      ok: false,
      errors: [
        {
          path: "",
          message: "El manifiesto tiene que ser un objeto JSON.",
          keyword: "type",
        },
      ],
    };
  const errors: ValidationError[] = [];
  if (!validateShape(manifest))
    errors.push(...describeAjvErrors(validateShape.errors, "El manifiesto"));

  const id = typeof manifest.id === "string" ? manifest.id : "";
  const permissions: unknown[] = Array.isArray(manifest.permissions)
    ? manifest.permissions
    : [];
  const seen = new Map<string, number>();
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

  // Cargos (positions[]) and grants[] may only hand out this module's own
  // permissions: never the kernel's or another module's.
  const declared = new Set(
    permissions
      .map((permission) =>
        isPlainObject(permission) ? permission.code : undefined,
      )
      .filter((code): code is string => typeof code === "string"),
  );
  const checkGranted = (list: unknown, path: string) => {
    if (!Array.isArray(list)) return;
    list.forEach((code: unknown, index: number) => {
      if (typeof code === "string" && !declared.has(code))
        errors.push({
          path: `${path}[${index}]`,
          message: `El permiso «${code}» no está en permissions[] de este manifiesto: un cargo solo puede dar permisos del propio módulo.`,
          keyword: "modulePermission",
        });
    });
  };
  const keys = new Map<string, number>();
  (Array.isArray(manifest.positions) ? manifest.positions : []).forEach(
    (template: unknown, index: number) => {
      if (!isPlainObject(template)) return;
      if (typeof template.key === "string") {
        if (keys.has(template.key))
          errors.push({
            path: `positions[${index}].key`,
            message: `La clave «${template.key}» está repetida (también en positions[${keys.get(template.key)}]).`,
            keyword: "uniqueKey",
          });
        else keys.set(template.key, index);
      }
      checkGranted(template.permissions, `positions[${index}].permissions`);
    },
  );
  const grantCodes = new Map<string, number>();
  (Array.isArray(manifest.grants) ? manifest.grants : []).forEach(
    (grant: unknown, index: number) => {
      if (!isPlainObject(grant)) return;
      if (typeof grant.positionCode === "string") {
        if (grantCodes.has(grant.positionCode))
          errors.push({
            path: `grants[${index}].positionCode`,
            message: `El cargo «${grant.positionCode}» está repetido (también en grants[${grantCodes.get(grant.positionCode)}]).`,
            keyword: "uniqueCode",
          });
        else grantCodes.set(grant.positionCode, index);
      }
      checkGranted(grant.permissions, `grants[${index}].permissions`);
    },
  );

  const events = isPlainObject(manifest.events) ? manifest.events : {};
  if (Array.isArray(events.emits))
    events.emits.forEach((type: unknown, index: number) => {
      if (typeof type === "string" && id && !type.startsWith(`${id}.`))
        errors.push({
          path: `events.emits[${index}]`,
          message: `El evento «${type}» tiene que empezar con «${id}.»: un módulo solo publica eventos propios.`,
          keyword: "namespace",
        });
    });
  if (Array.isArray(events.subscribes) && options.knownEventTypes) {
    const known = new Set(options.knownEventTypes);
    events.subscribes.forEach((type: unknown, index: number) => {
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

  const entryUrl = isPlainObject(manifest.ui)
    ? manifest.ui.entryUrl
    : undefined;
  if (
    typeof entryUrl === "string" &&
    entryUrl.startsWith("http://") &&
    !isLocalhost(entryUrl)
  )
    errors.push({
      path: "ui.entryUrl",
      message:
        "La dirección de entrada tiene que usar https (http solo se acepta para localhost).",
      keyword: "https",
    });

  return errors.length
    ? { ok: false, errors }
    : { ok: true, errors: [], manifest: manifest as ModuleManifest };
}

export type ConfigurationValidation =
  | { ok: true; errors: []; value: Record<string, unknown> }
  | { ok: false; errors: ValidationError[] };

/** Validates a club's configuration; the returned value has the defaults applied. */
export function validateConfiguration(
  schema: unknown,
  value: unknown,
): ConfigurationValidation {
  if (schema === undefined || schema === null)
    return isPlainObject(value) || value === undefined || value === null
      ? {
          ok: true,
          errors: [],
          value: (value ?? {}) as Record<string, unknown>,
        }
      : {
          ok: false,
          errors: [
            {
              path: "",
              message: "La configuración tiene que ser un objeto.",
              keyword: "type",
            },
          ],
        };
  const compiled = compileConfigurationSchema(schema);
  if (!compiled.ok)
    return {
      ok: false,
      errors: [
        { path: "", message: compiled.error, keyword: "configurationSchema" },
      ],
    };
  const copy =
    value === undefined || value === null ? {} : structuredClone(value);
  if (compiled.validate(copy))
    return { ok: true, errors: [], value: copy as Record<string, unknown> };
  return {
    ok: false,
    errors: describeAjvErrors(compiled.validate.errors, "La configuración"),
  };
}

/** -1, 0 or 1. Pre-release versions sort before their release. */
export function compareSemver(left: string, right: string): number {
  const parse = (version: string) => {
    const [core, pre] = version.split("+")[0].split(/-(.*)/s);
    return {
      parts: core.split(".").map((part) => Number(part) || 0),
      pre: pre ?? "",
    };
  };
  const a = parse(left);
  const b = parse(right);
  for (let i = 0; i < 3; i++) {
    if ((a.parts[i] ?? 0) !== (b.parts[i] ?? 0))
      return (a.parts[i] ?? 0) > (b.parts[i] ?? 0) ? 1 : -1;
  }
  if (a.pre === b.pre) return 0;
  if (!a.pre) return 1;
  if (!b.pre) return -1;
  return a.pre > b.pre ? 1 : -1;
}
