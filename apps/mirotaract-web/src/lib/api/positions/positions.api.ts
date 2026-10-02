import type { PermissionDefinition } from "../authorization/authorization.types";
import { apiRequest, httpClient } from "../client/http-client";
import type {
  CreatePositionDefinitionRequest,
  OrganizationType,
  PositionDefinition,
  UpdatePositionDefinitionRequest,
} from "./positions.types";

export const positionsApi = {
  list: (
    organizationType?: OrganizationType,
    opts?: { signal?: AbortSignal },
  ) =>
    apiRequest(() =>
      httpClient.GET("/position-definitions", {
        params: { query: { organizationType } },
        signal: opts?.signal,
      }),
    ) as Promise<PositionDefinition[]>,

  create: (payload: CreatePositionDefinitionRequest) =>
    apiRequest(() =>
      httpClient.POST("/position-definitions", { body: payload }),
    ) as Promise<PositionDefinition>,

  update: (
    positionDefinitionId: string,
    payload: UpdatePositionDefinitionRequest,
  ) =>
    apiRequest(() =>
      httpClient.PATCH("/position-definitions/{positionDefinitionId}", {
        params: { path: { positionDefinitionId } },
        body: payload,
      }),
    ) as Promise<PositionDefinition>,

  permissions: (
    positionDefinitionId: string,
    opts?: { signal?: AbortSignal },
  ) =>
    apiRequest(() =>
      httpClient.GET(
        "/position-definitions/{positionDefinitionId}/permissions",
        {
          params: { path: { positionDefinitionId } },
          signal: opts?.signal,
        },
      ),
    ) as Promise<PermissionDefinition[]>,

  attachPermission: (positionDefinitionId: string, permissionId: string) =>
    apiRequest(() =>
      httpClient.PUT(
        "/position-definitions/{positionDefinitionId}/permissions/{permissionId}",
        {
          params: { path: { positionDefinitionId, permissionId } },
        },
      ),
    ),

  detachPermission: (positionDefinitionId: string, permissionId: string) =>
    apiRequest(() =>
      httpClient.DELETE(
        "/position-definitions/{positionDefinitionId}/permissions/{permissionId}",
        { params: { path: { positionDefinitionId, permissionId } } },
      ),
    ),
};
