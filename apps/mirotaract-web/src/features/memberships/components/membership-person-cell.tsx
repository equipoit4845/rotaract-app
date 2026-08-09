"use client";

import { usePerson } from "@/lib/api";
import Link from "next/link";

import { personDisplayName } from "../adapters/person-display-name";

/**
 * TEMPORARY_BOUNDED_JOIN — resolves a person's display name with one
 * bounded request per distinct `personId` on the current page, deduplicated
 * by TanStack Query's cache (a page full of memberships sharing a person
 * across statuses issues one request per distinct id, never one per row).
 * Bounded by the list's page `limit`, never by the total number of
 * memberships — mirrors `OrganizationParentCell` (Organizations, US-ORG-01)
 * and `AuthorityRow` (Dashboard).
 *
 * There is no `listPersons` batch-by-id endpoint in `kernel-openapi.yaml`
 * (`PersonFilters` only has `query`/`cursor`/`limit`) — a real batch
 * resolution would need either that or a `personName` projection on
 * `MembershipPage` items. See QUERY_PROJECTION_CANDIDATE in
 * docs/09-administrative-web.md. `usePerson` is Persons' own public hook
 * from `@/lib/api` — this never imports from `features/persons/**`
 * (product spec §22).
 *
 * Only ever renders a name — never email/phone/birthDate (product spec
 * §15, PII stays minimal even though the full `Person` DTO is in hand).
 * `linkToProfile` is opt-in: the membership detail page's summary card
 * wants a link to `/persons/[id]` (product spec §7), the list/history
 * timeline don't need one (their own row already links elsewhere).
 */
export function MembershipPersonCell({
  personId,
  linkToProfile = false,
}: {
  personId: string;
  linkToProfile?: boolean;
}) {
  const { data: person, isLoading } = usePerson(personId);

  // A plain text placeholder, never `Skeleton` (renders a `<div>`) — this
  // cell is also used inline inside a `<p>` (`MembershipHistoryTimeline`),
  // where a block element would be invalid HTML.
  if (isLoading) return <span aria-hidden="true">…</span>;
  if (!person) return <span>—</span>;

  const name = personDisplayName(person);
  if (linkToProfile) {
    return <Link href={`/persons/${personId}`}>{name}</Link>;
  }
  return <span>{name}</span>;
}
