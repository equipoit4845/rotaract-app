import type { components } from "../client/schema";

export type PermissionDefinition =
  components["schemas"]["PermissionDefinition"];
export type CreatePermissionRequest =
  components["schemas"]["CreatePermissionRequest"];
export type RoleDefinition = components["schemas"]["RoleDefinition"];
export type CreateRoleRequest = components["schemas"]["CreateRoleRequest"];
export type RoleAssignment = components["schemas"]["RoleAssignment"];
export type GrantRoleRequest = components["schemas"]["GrantRoleRequest"];
export type AuthorizationCheckRequest =
  components["schemas"]["AuthorizationCheckRequest"];
export type AuthorizationDecision =
  components["schemas"]["AuthorizationDecision"];
export type ScopeType = components["schemas"]["ScopeType"];

export type RoleAssignmentFilters = {
  personId?: string;
  organizationId?: string;
  roleDefinitionId?: string;
  includeRevoked?: boolean;
};

export type CanScope = {
  scopeType: ScopeType;
  scopeId?: string;
};
