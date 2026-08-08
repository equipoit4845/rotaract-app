import { apiRequest, httpClient } from "../client/http-client";
import type {
  CreateOrganizationRequest,
  Organization,
  OrganizationFilters,
  OrganizationPage,
  UpdateOrganizationRequest,
} from "./organizations.types";

export const organizationsApi = {
  list: (filters: OrganizationFilters, opts?: { signal?: AbortSignal }) =>
    apiRequest(() =>
      httpClient.GET("/organizations", {
        params: { query: filters },
        signal: opts?.signal,
      }),
    ) as Promise<OrganizationPage>,

  get: (organizationId: string, opts?: { signal?: AbortSignal }) =>
    apiRequest(() =>
      httpClient.GET("/organizations/{organizationId}", {
        params: { path: { organizationId } },
        signal: opts?.signal,
      }),
    ) as Promise<Organization>,

  create: (payload: CreateOrganizationRequest) =>
    apiRequest(() =>
      httpClient.POST("/organizations", { body: payload }),
    ) as Promise<Organization>,

  update: (organizationId: string, payload: UpdateOrganizationRequest) =>
    apiRequest(() =>
      httpClient.PATCH("/organizations/{organizationId}", {
        params: { path: { organizationId } },
        body: payload,
      }),
    ) as Promise<Organization>,

  activate: (organizationId: string) =>
    apiRequest(() =>
      httpClient.POST("/organizations/{organizationId}/activate", {
        params: { path: { organizationId } },
      }),
    ) as Promise<Organization>,

  deactivate: (organizationId: string) =>
    apiRequest(() =>
      httpClient.POST("/organizations/{organizationId}/deactivate", {
        params: { path: { organizationId } },
      }),
    ) as Promise<Organization>,

  archive: (organizationId: string) =>
    apiRequest(() =>
      httpClient.POST("/organizations/{organizationId}/archive", {
        params: { path: { organizationId } },
      }),
    ) as Promise<Organization>,

  move: (organizationId: string, newParentId: string | null) =>
    apiRequest(() =>
      httpClient.POST("/organizations/{organizationId}/move", {
        params: { path: { organizationId } },
        body: { newParentId },
      }),
    ) as Promise<Organization>,

  children: (organizationId: string, opts?: { signal?: AbortSignal }) =>
    apiRequest(() =>
      httpClient.GET("/organizations/{organizationId}/children", {
        params: { path: { organizationId } },
        signal: opts?.signal,
      }),
    ) as Promise<Organization[]>,

  ancestors: (organizationId: string, opts?: { signal?: AbortSignal }) =>
    apiRequest(() =>
      httpClient.GET("/organizations/{organizationId}/ancestors", {
        params: { path: { organizationId } },
        signal: opts?.signal,
      }),
    ) as Promise<Organization[]>,

  descendants: (organizationId: string, opts?: { signal?: AbortSignal }) =>
    apiRequest(() =>
      httpClient.GET("/organizations/{organizationId}/descendants", {
        params: { path: { organizationId } },
        signal: opts?.signal,
      }),
    ) as Promise<Organization[]>,
};
