"use client";

import { useOrganization } from "@/lib/api";
import type { OrganizationMembership } from "@/lib/api";
import { statusLabel } from "@/lib/status/status-catalog";

/** Bounded by the person's own membership count (see PersonMembershipRow for the same reasoning). */
export function InviteMembershipOption({
  membership,
}: {
  membership: OrganizationMembership;
}) {
  const { data: organization } = useOrganization(membership.organizationId);
  return (
    <option value={membership.id}>
      {organization ? organization.name : "…"} —{" "}
      {statusLabel("membership", membership.status)}
    </option>
  );
}
