"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useCurrentUser } from "../auth/auth.hooks";
import { authorizationApi } from "./authorization.api";
import { authorizationKeys } from "./authorization.keys";
import type {
  AuthorizationCheckRequest,
  CanScope,
  CreatePermissionRequest,
  CreateRoleRequest,
  GrantRoleRequest,
  RoleAssignmentFilters,
} from "./authorization.types";

export function usePermissions() {
  return useQuery({
    queryKey: authorizationKeys.permissions(),
    queryFn: ({ signal }) => authorizationApi.listPermissions({ signal }),
    staleTime: 5 * 60_000,
  });
}

export function useRoles() {
  return useQuery({
    queryKey: authorizationKeys.roles(),
    queryFn: ({ signal }) => authorizationApi.listRoles({ signal }),
    staleTime: 5 * 60_000,
  });
}

export function useRoleAssignments(filters: RoleAssignmentFilters = {}) {
  return useQuery({
    queryKey: authorizationKeys.roleAssignmentList(filters),
    queryFn: ({ signal }) =>
      authorizationApi.listRoleAssignments(filters, { signal }),
  });
}

/** Cached per (person, organization, period) so many `useCan` calls on one screen share a single request. */
export function useEffectivePermissions(
  personId: string | undefined,
  filters: { organizationId?: string; periodId?: string } = {},
) {
  return useQuery({
    queryKey: authorizationKeys.effectivePermissions(
      personId ?? "",
      filters.organizationId,
      filters.periodId,
    ),
    queryFn: ({ signal }) =>
      authorizationApi.effectivePermissions(personId as string, filters, {
        signal,
      }),
    enabled: Boolean(personId),
    staleTime: 60_000,
  });
}

/**
 * UX-only permission gate — never a substitute for the API's own
 * authorization decision (kernel-openapi.yaml §19). Backed by the cached
 * effective-permissions list, not a per-button HTTP request.
 */
export function useCan(permission: string, scope?: CanScope): boolean {
  const { data: currentUser } = useCurrentUser();
  const organizationId =
    scope?.scopeType === "PLATFORM" ? undefined : scope?.scopeId;
  const { data: permissions } = useEffectivePermissions(currentUser?.personId, {
    organizationId,
  });
  return permissions?.includes(permission) ?? false;
}

export function useCreateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateRoleRequest) =>
      authorizationApi.createRole(payload),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: authorizationKeys.roles() }),
  });
}

export function useRegisterPermission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreatePermissionRequest) =>
      authorizationApi.registerPermission(payload),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: authorizationKeys.permissions(),
      }),
  });
}

export function useAttachPermissionToRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      roleId,
      permissionId,
    }: {
      roleId: string;
      permissionId: string;
    }) => authorizationApi.attachPermissionToRole(roleId, permissionId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: authorizationKeys.roles() }),
  });
}

export function useDetachPermissionFromRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      roleId,
      permissionId,
    }: {
      roleId: string;
      permissionId: string;
    }) => authorizationApi.detachPermissionFromRole(roleId, permissionId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: authorizationKeys.roles() }),
  });
}

export function useGrantRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: GrantRoleRequest) =>
      authorizationApi.grantRole(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: authorizationKeys.roleAssignments(),
      });
      queryClient.invalidateQueries({
        queryKey: authorizationKeys.allEffectivePermissions(),
      });
    },
  });
}

export function useRevokeRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (assignmentId: string) =>
      authorizationApi.revokeRole(assignmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: authorizationKeys.roleAssignments(),
      });
      queryClient.invalidateQueries({
        queryKey: authorizationKeys.allEffectivePermissions(),
      });
    },
  });
}

export function useAuthorizationCheck() {
  return useMutation({
    mutationFn: (payload: AuthorizationCheckRequest) =>
      authorizationApi.check(payload),
  });
}

export function useBatchAuthorizationCheck() {
  return useMutation({
    mutationFn: (checks: AuthorizationCheckRequest[]) =>
      authorizationApi.batchCheck(checks),
  });
}
