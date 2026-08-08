import { apiRequest, httpClient } from "../client/http-client";
import type {
  CreateModuleRequest,
  ModuleDefinition,
  ModuleInstallation,
  ModuleStatus,
  OrganizationCapabilities,
} from "./modules.types";

export const modulesApi = {
  list: (status?: ModuleStatus, opts?: { signal?: AbortSignal }) =>
    apiRequest(() =>
      httpClient.GET("/modules", {
        params: { query: { status } },
        signal: opts?.signal,
      }),
    ) as Promise<ModuleDefinition[]>,

  get: (moduleId: string, opts?: { signal?: AbortSignal }) =>
    apiRequest(() =>
      httpClient.GET("/modules/{moduleId}", {
        params: { path: { moduleId } },
        signal: opts?.signal,
      }),
    ) as Promise<ModuleDefinition>,

  register: (payload: CreateModuleRequest) =>
    apiRequest(() =>
      httpClient.POST("/modules", { body: payload }),
    ) as Promise<ModuleDefinition>,

  updateManifest: (
    moduleId: string,
    payload: {
      manifest: Record<string, unknown>;
      configurationSchema?: Record<string, unknown> | null;
    },
  ) =>
    apiRequest(() =>
      httpClient.PUT("/modules/{moduleId}/manifest", {
        params: { path: { moduleId } },
        // `as never`: see memberships.api.ts — untyped `object` schema fields.
        body: payload as never,
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
          body:
            configuration !== undefined
              ? ({ configuration } as never)
              : undefined,
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
