import type { components, operations } from "../client/schema";

export type ModuleDefinition = components["schemas"]["ModuleDefinition"];
export type CreateModuleRequest = components["schemas"]["CreateModuleRequest"];
export type ModuleInstallation = components["schemas"]["ModuleInstallation"];
export type ModuleStatus = components["schemas"]["ModuleStatus"];
export type InstallationStatus = components["schemas"]["InstallationStatus"];

export type OrganizationCapabilities =
  operations["getOrganizationCapabilities"]["responses"][200]["content"]["application/json"];
