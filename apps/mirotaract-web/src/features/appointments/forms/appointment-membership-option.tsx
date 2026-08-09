"use client";

import { usePerson } from "@/lib/api";
import type { OrganizationMembership } from "@/lib/api";

import { personDisplayName } from "../adapters/person-display-name";

/**
 * One `<option>` = one bounded `usePerson` lookup, deduped/cached by
 * TanStack Query — bounded by how many memberships the picker's single
 * page request returned (never the whole membership dataset), same class
 * as `AppointmentMembershipCell`/`AuthorityRow`.
 */
export function AppointmentMembershipOption({
  membership,
}: {
  membership: OrganizationMembership;
}) {
  const { data: person } = usePerson(membership.personId);
  return (
    <option value={membership.id}>
      {person ? personDisplayName(person) : "…"}
    </option>
  );
}
