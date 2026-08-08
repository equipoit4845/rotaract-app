"use client";

import { useCurrentUser, useOrganizations } from "@/lib/api";
import type { OrganizationOption } from "@equipoit4845/admin-shell";

/**
 * Real organization names for the person's ACTIVE memberships, adapted
 * from Kernel data — `OrganizationSwitcher` never sees a Kernel
 * `Organization`, only `{ id, name }`.
 *
 * Sourced from the first page of `useOrganizations({ status: "ACTIVE" })`
 * (already public via the barrel) filtered down to the person's membership
 * ids, rather than fetching each membership's organization individually —
 * there's no public "my organizations" hook, and adding one would mean
 * touching the Kernel consumption layer, which is out of scope here. Fine
 * for a small institutional org tree; revisit if the active-organization
 * list ever needs a second page to find a person's memberships.
 */
export function useOrganizationOptions(): {
  options: OrganizationOption[];
  isLoading: boolean;
} {
  const { data: currentUser } = useCurrentUser();
  const organizationsQuery = useOrganizations({ status: "ACTIVE" });

  const membershipOrgIds = new Set(
    (currentUser?.memberships ?? [])
      .filter((membership) => membership.status === "ACTIVE")
      .map((membership) => membership.organizationId),
  );

  const options: OrganizationOption[] = (organizationsQuery.data?.pages ?? [])
    .flatMap((page) => page.items ?? [])
    .filter((organization) => membershipOrgIds.has(organization.id))
    .map((organization) => ({ id: organization.id, name: organization.name }));

  return { options, isLoading: organizationsQuery.isLoading };
}
