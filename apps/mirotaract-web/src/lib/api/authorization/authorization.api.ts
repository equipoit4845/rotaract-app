import { apiRequest, httpClient } from "../client/http-client";
import type {
  AuthorizationCheckRequest,
  AuthorizationDecision,
  CreatePermissionRequest,
  CreateRoleRequest,
  GrantRoleRequest,
  PermissionDefinition,
  RoleAssignment,
  RoleAssignmentFilters,
  RoleDefinition,
} from "./authorization.types";

export const authorizationApi = {
  listPermissions: (opts?: { signal?: AbortSignal }) =>
    apiRequest(() =>
      httpClient.GET("/permissions", { signal: opts?.signal }),
    ) as Promise<PermissionDefinition[]>,

  registerPermission: (payload: CreatePermissionRequest) =>
    apiRequest(() =>
      httpClient.POST("/permissions", { body: payload }),
    ) as Promise<PermissionDefinition>,

  listRoles: (opts?: { signal?: AbortSignal }) =>
    apiRequest(() =>
      httpClient.GET("/roles", { signal: opts?.signal }),
    ) as Promise<RoleDefinition[]>,

  createRole: (payload: CreateRoleRequest) =>
    apiRequest(() =>
      httpClient.POST("/roles", { body: payload }),
    ) as Promise<RoleDefinition>,

  attachPermissionToRole: (roleId: string, permissionId: string) =>
    apiRequest(() =>
      httpClient.PUT("/roles/{roleId}/permissions/{permissionId}", {
        params: { path: { roleId, permissionId } },
      }),
    ),

  detachPermissionFromRole: (roleId: string, permissionId: string) =>
    apiRequest(() =>
      httpClient.DELETE("/roles/{roleId}/permissions/{permissionId}", {
        params: { path: { roleId, permissionId } },
      }),
    ),

  grantRole: (payload: GrantRoleRequest) =>
    apiRequest(() =>
      httpClient.POST("/role-assignments", { body: payload }),
    ) as Promise<RoleAssignment>,

  listRoleAssignments: (
    filters: RoleAssignmentFilters,
    opts?: { signal?: AbortSignal },
  ) =>
    apiRequest(() =>
      httpClient.GET("/role-assignments", {
        params: { query: filters },
        signal: opts?.signal,
      }),
    ) as Promise<RoleAssignment[]>,

  revokeRole: (assignmentId: string) =>
    apiRequest(() =>
      httpClient.POST("/role-assignments/{assignmentId}/revoke", {
        params: { path: { assignmentId } },
      }),
    ) as Promise<RoleAssignment>,

  check: (
    payload: AuthorizationCheckRequest,
    opts?: { signal?: AbortSignal },
  ) =>
    apiRequest(() =>
      httpClient.POST("/authorization/check", {
        body: payload,
        signal: opts?.signal,
      }),
    ) as Promise<AuthorizationDecision>,

  batchCheck: (
    checks: AuthorizationCheckRequest[],
    opts?: { signal?: AbortSignal },
  ) =>
    apiRequest(() =>
      httpClient.POST("/authorization/batch-check", {
        body: { checks },
        signal: opts?.signal,
      }),
    ) as Promise<AuthorizationDecision[]>,

  effectivePermissions: (
    personId: string,
    filters: { organizationId?: string; periodId?: string },
    opts?: { signal?: AbortSignal },
  ) =>
    apiRequest(() =>
      httpClient.GET("/persons/{personId}/effective-permissions", {
        params: { path: { personId }, query: filters },
        signal: opts?.signal,
      }),
    ) as Promise<string[]>,
};
