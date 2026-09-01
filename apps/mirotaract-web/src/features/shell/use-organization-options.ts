"use client";

import { useCurrentUser } from "@/lib/api";
import type { OrganizationOption } from "@equipoit4845/admin-shell";

/**
 * The Kernel returns named workspaces authorized by active memberships and
 * role assignments. This deliberately does not call the global organization
 * list: a district officer should switch only among its own district/tree.
 */
export function useOrganizationOptions(): {
  options: OrganizationOption[];
  isLoading: boolean;
} {
  const { data: currentUser, isLoading } = useCurrentUser();
  const options: OrganizationOption[] = (currentUser?.workspaces ?? []).map(
    (workspace) => ({ id: workspace.organizationId, name: workspace.name }),
  );

  return { options, isLoading };
}
