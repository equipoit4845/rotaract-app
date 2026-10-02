import { apiRequest, httpClient } from "../client/http-client";
import type {
  CreateDeveloperAppRequest,
  CreatedDeveloperApp,
  DeveloperApp,
  DeveloperAppSecretCreated,
  UpdateDeveloperAppRequest,
} from "./developer-apps.types";

/**
 * The DeveloperApps mutations declare `Idempotency-Key` as a *required*
 * header parameter in kernel-openapi.yaml (most other operations rely on
 * the shared header the http-client middleware adds). The typed client
 * therefore demands it here; one key per logical call, and the middleware
 * keeps it as-is (it only fills the header when missing) so a 401 replay
 * reuses the same key.
 */
function idempotencyHeader() {
  return { "Idempotency-Key": crypto.randomUUID() };
}

export const developerAppsApi = {
  list: (organizationId: string, opts?: { signal?: AbortSignal }) =>
    apiRequest(() =>
      httpClient.GET("/developer/apps", {
        params: { query: { organizationId } },
        signal: opts?.signal,
      }),
    ) as Promise<DeveloperApp[]>,

  get: (appId: string, opts?: { signal?: AbortSignal }) =>
    apiRequest(() =>
      httpClient.GET("/developer/apps/{appId}", {
        params: { path: { appId } },
        signal: opts?.signal,
      }),
    ) as Promise<DeveloperApp>,

  create: (payload: CreateDeveloperAppRequest) =>
    apiRequest(() =>
      httpClient.POST("/developer/apps", {
        params: { header: idempotencyHeader() },
        body: payload,
      }),
    ) as Promise<CreatedDeveloperApp>,

  update: (appId: string, payload: UpdateDeveloperAppRequest) =>
    apiRequest(() =>
      httpClient.PATCH("/developer/apps/{appId}", {
        params: { path: { appId }, header: idempotencyHeader() },
        body: payload,
      }),
    ) as Promise<DeveloperApp>,

  rotateSecret: (appId: string) =>
    apiRequest(() =>
      httpClient.POST("/developer/apps/{appId}/secrets", {
        params: { path: { appId }, header: idempotencyHeader() },
      }),
    ) as Promise<DeveloperAppSecretCreated>,

  revokeSecret: (appId: string, secretId: string) =>
    apiRequest(() =>
      httpClient.DELETE("/developer/apps/{appId}/secrets/{secretId}", {
        params: { path: { appId, secretId } },
      }),
    ),

  suspend: (appId: string) =>
    apiRequest(() =>
      httpClient.POST("/developer/apps/{appId}/suspend", {
        params: { path: { appId }, header: idempotencyHeader() },
      }),
    ) as Promise<DeveloperApp>,

  activate: (appId: string) =>
    apiRequest(() =>
      httpClient.POST("/developer/apps/{appId}/activate", {
        params: { path: { appId }, header: idempotencyHeader() },
      }),
    ) as Promise<DeveloperApp>,

  revoke: (appId: string) =>
    apiRequest(() =>
      httpClient.POST("/developer/apps/{appId}/revoke", {
        params: { path: { appId }, header: idempotencyHeader() },
      }),
    ) as Promise<DeveloperApp>,
};
