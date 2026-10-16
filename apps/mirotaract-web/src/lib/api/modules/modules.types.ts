import type { components, operations } from "../client/schema";

export type ModuleDefinition = components["schemas"]["ModuleDefinition"];
export type RegisterModuleRequest =
  components["schemas"]["RegisterModuleRequest"];
export type ModuleInstallation = components["schemas"]["ModuleInstallation"];
export type ModuleInstallationInTree =
  components["schemas"]["ModuleInstallationInTree"];
export type ModuleStatus = components["schemas"]["ModuleStatus"];
export type InstallationStatus = components["schemas"]["InstallationStatus"];

/** The module's position templates and grants in one organization. */
export type ModulePositionsOverview =
  components["schemas"]["ModulePositionsOverview"];
/** What to create / approve when installing (or later). */
export type ModulePositionSelection = { positions: string[]; grants: string[] };

export type OrganizationCapabilities =
  operations["getOrganizationCapabilities"]["responses"][200]["content"]["application/json"];

/** A JSON Schema node, as far as the configuration form reads it. */
export type JsonSchemaNode = {
  type?: string | string[];
  title?: string;
  description?: string;
  enum?: unknown[];
  const?: unknown;
  default?: unknown;
  format?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  required?: string[];
  properties?: Record<string, JsonSchemaNode>;
  items?: JsonSchemaNode;
  additionalProperties?: boolean | JsonSchemaNode;
};

/** The parts of a v1 manifest (mirotaract.module.json) the web reads. */
export type ModuleManifestView = {
  description?: string;
  permissions?: Array<{
    code: string;
    name: string;
    description?: string;
    scopeType?: "ORGANIZATION" | "ORGANIZATION_TREE";
  }>;
  positions?: Array<{ key: string; name: string }>;
  grants?: Array<{ positionCode: string; permissions: string[] }>;
  ui?: { entryUrl?: string; navLabel?: string; icon?: string };
};
