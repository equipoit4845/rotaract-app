"use client";

import { useMembership, usePerson } from "@/lib/api";
import { Skeleton } from "@equipoit4845/ui";
import Link from "next/link";

import { personDisplayName } from "../adapters/person-display-name";

/**
 * TEMPORARY_BOUNDED_JOIN — `Appointment` only carries `membershipId`, never
 * a denormalized person name (`kernel-openapi.yaml`'s `Appointment` schema
 * has no such projection). Resolved here with one bounded pair of lookups
 * (membership, then person) per row, deduped/cached by TanStack Query —
 * bounded by how many appointments are actually rendered on screen (an
 * organization's own roster, never proportional to the whole person/
 * membership dataset), same class as `AuthorityRow` (Dashboard) and
 * `MembershipPersonCell` (Memberships). See QUERY_PROJECTION_CANDIDATE in
 * docs/09-administrative-web.md.
 */
export function AppointmentMembershipCell({
  membershipId,
  linkToProfile = false,
}: {
  membershipId: string;
  linkToProfile?: boolean;
}) {
  const { data: membership, isLoading: isLoadingMembership } =
    useMembership(membershipId);
  const { data: person, isLoading: isLoadingPerson } = usePerson(
    membership?.personId,
  );

  if (isLoadingMembership || isLoadingPerson) {
    return <Skeleton style={{ height: "1rem", width: "8rem" }} />;
  }
  if (!person) return <span>—</span>;

  const name = personDisplayName(person);
  if (linkToProfile) {
    return <Link href={`/persons/${person.id}`}>{name}</Link>;
  }
  return <span>{name}</span>;
}
