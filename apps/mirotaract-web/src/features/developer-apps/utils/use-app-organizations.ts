"use client";

import { useOrganizationDescendants } from "@/lib/api";
import type { Organization } from "@/lib/api";

/**
 * Organizations an app can be tied to from the active workspace: the active
 * organization itself plus, when it is a district, its active clubs. One
 * bounded request (`/organizations/{id}/descendants`), also used to show
 * each app's organization name in the list without a request per row.
 */
export function useAppOrganizations(
  activeOrganization: Organization | undefined,
) {
  const isDistrict = activeOrganization?.type === "DISTRICT";
  const descendants = useOrganizationDescendants(
    isDistrict ? activeOrganization?.id : undefined,
  );

  const clubs = (descendants.data ?? []).filter(
    (organization) =>
      organization.type === "CLUB" && organization.status === "ACTIVE",
  );
  const options = activeOrganization ? [activeOrganization, ...clubs] : clubs;

  const byId = new Map<string, string>();
  for (const organization of [
    ...(activeOrganization ? [activeOrganization] : []),
    ...(descendants.data ?? []),
  ]) {
    byId.set(organization.id, organization.name);
  }

  return {
    options,
    isLoading: isDistrict && descendants.isLoading,
    nameOf: (organizationId: string) => byId.get(organizationId),
  };
}
