"use client";

import { useOrganization } from "@/lib/api";
import type { OrganizationMembership } from "@/lib/api";

import { membershipStatusToLabel } from "../adapters/membership-status-to-tone";

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
      {membershipStatusToLabel(membership.status)}
    </option>
  );
}
