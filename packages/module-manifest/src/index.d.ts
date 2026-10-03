/** Alcance de un permiso de módulo. */
export type ModulePermissionScope = "ORGANIZATION" | "ORGANIZATION_TREE";

export interface ModulePermission {
  /** `<moduleId>.<recurso>.<acción>`, p. ej. `reuniones.meeting.manage`. */
  code: string;
  /** Qué permite, en lenguaje simple (lo ve el RDR). */
  name: string;
  description?: string;
  /** Default: ORGANIZATION. */
  scopeType?: ModulePermissionScope;
}

/** JSON Schema (draft-07) de la configuración por club. */
export type JsonSchema = { [key: string]: unknown };

/** mirotaract.module.json, contrato v1. */
export interface ModuleManifest {
  $schema?: string;
  id: string;
  name: string;
  description?: string;
  version: string;
  contractVersion: 1;
  permissions: ModulePermission[];
  events?: {
    /** Tipos del catálogo público, p. ej. `membership.activated.v1`. */
    subscribes?: string[];
    /** Eventos propios: `<moduleId>.<...>.v1`. */
    emits?: string[];
  };
  configurationSchema?: JsonSchema;
  ui?: {
    entryUrl: string;
    navLabel?: string;
    /** Nombre de un ícono de lucide, p. ej. `calendar-check`. */
    icon?: string;
  };
  oauth?: {
    clientId?: string;
    scopes?: string[];
  };
  capabilities?: string[];
}

export interface ValidationError {
  /** Ruta del campo, p. ej. `permissions[0].code` ("" = raíz). */
  path: string;
  /** Mensaje en español, listo para mostrar. */
  message: string;
  /** Palabra clave de JSON Schema o regla propia (namespace, uniqueCode...). */
  keyword: string;
}

export type ManifestValidationResult =
  | { ok: true; errors: []; manifest: ModuleManifest }
  | { ok: false; errors: ValidationError[]; manifest?: undefined };

export type ConfigurationValidationResult =
  | { ok: true; errors: []; value: Record<string, unknown> }
  | { ok: false; errors: ValidationError[]; value?: undefined };

export declare const manifestSchema: JsonSchema;
export declare const MANIFEST_SCHEMA_URL: string;
export declare const MANIFEST_FILE_NAME: "mirotaract.module.json";
export declare const CONTRACT_VERSION: 1;
export declare const RESERVED_MODULE_IDS: readonly string[];

/** Valida un manifiesto. Nunca lanza excepciones. */
export declare function validateManifest(
  manifest: unknown,
  options?: { knownEventTypes?: readonly string[] },
): ManifestValidationResult;

/** Valida la configuración de un club contra el `configurationSchema` del módulo (aplica defaults a una copia). */
export declare function validateConfiguration(
  schema: JsonSchema | null | undefined,
  value: unknown,
): ConfigurationValidationResult;

export declare function compileConfigurationSchema(
  schema: unknown,
):
  | { ok: true; validate: (value: unknown) => boolean }
  | { ok: false; error: string };

/** `"reuniones.meeting.manage"` → `"reuniones"`. */
export declare function permissionNamespace(code: string): string;
/** True si `code` es `<moduleId>.<algo>`. */
export declare function isModulePermission(
  moduleId: string,
  code: string,
): boolean;

export declare function pointerToPath(pointer: string): string;
export declare function describeAjvErrors(
  errors: unknown,
  rootLabel?: string,
): ValidationError[];
export declare function summarizeErrors(errors: ValidationError[]): string;
