import type { RoleAssignmentFilters } from "./authorization.types";

export const authorizationKeys = {
  all: ["authorization"] as const,
  permissions: () => [...authorizationKeys.all, "permissions"] as const,
  roles: () => [...authorizationKeys.all, "roles"] as const,
  roleAssignments: () => [...authorizationKeys.all, "roleAssignments"] as const,
  roleAssignmentList: (filters: RoleAssignmentFilters) =>
    [...authorizationKeys.roleAssignments(), filters] as const,
  /** Prefix shared by every cached effective-permissions entry — invalidate this to cover all of them at once. */
  allEffectivePermissions: () =>
    [...authorizationKeys.all, "effectivePermissions"] as const,
  effectivePermissions: (
    personId: string,
    organizationId?: string,
    periodId?: string,
  ) =>
    [
      ...authorizationKeys.allEffectivePermissions(),
      personId,
      organizationId ?? null,
      periodId ?? null,
    ] as const,
};
