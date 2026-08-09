"use client";

import { useMembership, usePerson } from "@/lib/api";

/**
 * TEMPORARY_BOUNDED_JOIN — `MembershipTransfer` only has `membershipId`, no
 * denormalized person data (kernel-openapi.yaml). Resolves it by chaining
 * two public hooks: `useMembership(membershipId)` for `personId`, then
 * `usePerson(personId)`. Both are deduplicated by TanStack Query's cache
 * per distinct id, bounded by however many transfers are on the current
 * page/detail — never a per-row extra fetch beyond that. Mirrors
 * `MembershipPersonCell` (Memberships, US-MEM-01), duplicated locally on
 * purpose (product spec §32 — this never imports from
 * `features/memberships/**`).
 *
 * Only ever renders a name — never email/phone/birthDate (product spec
 * §15, PII stays minimal even though the full `Person` DTO is in hand).
 */
export function TransferPersonCell({ membershipId }: { membershipId: string }) {
  const { data: membership, isLoading: membershipLoading } =
    useMembership(membershipId);
  const { data: person, isLoading: personLoading } = usePerson(
    membership?.personId,
  );

  if (membershipLoading || (membership && personLoading)) {
    return <span aria-hidden="true">…</span>;
  }
  if (!person) return <span>—</span>;

  const name =
    person.displayName?.trim() || `${person.firstName} ${person.lastName}`;
  return <span>{name}</span>;
}
