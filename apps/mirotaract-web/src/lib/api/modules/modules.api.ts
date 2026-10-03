import { apiRequest, httpClient } from "../client/http-client";
import type {
  InstallationStatus,
  ModuleDefinition,
  ModuleInstallation,
  ModuleInstallationInTree,
  ModuleStatus,
  OrganizationCapabilities,
  RegisterModuleRequest,
} from "./modules.types";

export const modulesApi = {
  /** `organizationId`: where kernel.module.read is evaluated (the active organization). */
  list: (
    params: { status?: ModuleStatus; organizationId?: string } = {},
    opts?: { signal?: AbortSignal },
  ) =>
    apiRequest(() =>
      httpClient.GET("/modules", {
        params: { query: params },
        signal: opts?.signal,
      }),
    ) as Promise<ModuleDefinition[]>,

  get: (
    moduleId: string,
    organizationId?: string,
    opts?: { signal?: AbortSignal },
  ) =>
    apiRequest(() =>
      httpClient.GET("/modules/{moduleId}", {
        params: { path: { moduleId }, query: { organizationId } },
        signal: opts?.signal,
      }),
    ) as Promise<ModuleDefinition>,

  register: (payload: RegisterModuleRequest) =>
    apiRequest(() =>
      httpClient.POST("/modules", { body: payload as never }),
    ) as Promise<ModuleDefinition>,

  updateManifest: (moduleId: string, manifest: Record<string, unknown>) =>
    apiRequest(() =>
      httpClient.PUT("/modules/{moduleId}/manifest", {
        params: { path: { moduleId } },
        // `as never`: see memberships.api.ts — untyped `object` schema fields.
        body: { manifest } as never,
      }),
    ) as Promise<ModuleDefinition>,

  deprecate: (moduleId: string) =>
    apiRequest(() =>
      httpClient.POST("/modules/{moduleId}/deprecate", {
        params: { path: { moduleId } },
      }),
    ) as Promise<ModuleDefinition>,

  install: (
    organizationId: string,
    moduleId: string,
    configuration?: Record<string, unknown> | null,
  ) =>
    apiRequest(() =>
      httpClient.POST(
        "/organizations/{organizationId}/modules/{moduleId}/install",
        {
          params: { path: { organizationId, moduleId } },
          body: (configuration !== undefined ? { configuration } : {}) as never,
        },
      ),
    ) as Promise<ModuleInstallation>,

  activateInstallation: (organizationId: string, moduleId: string) =>
    apiRequest(() =>
      httpClient.POST(
        "/organizations/{organizationId}/modules/{moduleId}/activate",
        {
          params: { path: { organizationId, moduleId } },
        },
      ),
    ) as Promise<ModuleInstallation>,

  updateConfiguration: (
    organizationId: string,
    moduleId: string,
    configuration: Record<string, unknown>,
  ) =>
    apiRequest(() =>
      httpClient.PATCH(
        "/organizations/{organizationId}/modules/{moduleId}/configuration",
        {
          params: { path: { organizationId, moduleId } },
          body: { configuration } as never,
        },
      ),
    ) as Promise<ModuleInstallation>,

  suspendInstallation: (organizationId: string, moduleId: string) =>
    apiRequest(() =>
      httpClient.POST(
        "/organizations/{organizationId}/modules/{moduleId}/suspend",
        {
          params: { path: { organizationId, moduleId } },
        },
      ),
    ) as Promise<ModuleInstallation>,

  disableInstallation: (organizationId: string, moduleId: string) =>
    apiRequest(() =>
      httpClient.POST(
        "/organizations/{organizationId}/modules/{moduleId}/disable",
        {
          params: { path: { organizationId, moduleId } },
        },
      ),
    ) as Promise<ModuleInstallation>,

  listOrganizationModules: (
    organizationId: string,
    opts?: { signal?: AbortSignal },
  ) =>
    apiRequest(() =>
      httpClient.GET("/organizations/{organizationId}/modules", {
        params: { path: { organizationId } },
        signal: opts?.signal,
      }),
    ) as Promise<ModuleInstallation[]>,

  /** District view: installations in the organization and every one below it. */
  listInstallationsInTree: (
    organizationId: string,
    filters: { moduleId?: string; status?: InstallationStatus } = {},
    opts?: { signal?: AbortSignal },
  ) =>
    apiRequest(() =>
      httpClient.GET("/organizations/{organizationId}/module-installations", {
        params: { path: { organizationId }, query: filters },
        signal: opts?.signal,
      }),
    ) as Promise<ModuleInstallationInTree[]>,

  organizationCapabilities: (
    organizationId: string,
    opts?: { signal?: AbortSignal },
  ) =>
    apiRequest(() =>
      httpClient.GET("/organizations/{organizationId}/capabilities", {
        params: { path: { organizationId } },
        signal: opts?.signal,
      }),
    ) as Promise<OrganizationCapabilities>,
};
