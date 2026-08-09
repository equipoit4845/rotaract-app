"use client";

import { useOrganization } from "@/lib/api";
import Link from "next/link";

/**
 * TEMPORARY_BOUNDED_JOIN — `MembershipTransfer` only has
 * `fromOrganizationId`/`toOrganizationId`, no denormalized name
 * (kernel-openapi.yaml). One bounded `useOrganization(organizationId)` per
 * distinct id, deduplicated by TanStack Query. `linkToProfile` is opt-in
 * (detail page wants a link to `/organizations/[id]`, the table doesn't
 * need one — its own row already links to the transfer detail). This is a
 * plain `next/link`, never `setActiveOrganizationId` — opening an
 * organization from here never mutates the Shell's active organization
 * scope (product spec §6).
 */
export function TransferOrganizationCell({
  organizationId,
  linkToProfile = false,
}: {
  organizationId: string;
  linkToProfile?: boolean;
}) {
  const { data: organization, isLoading } = useOrganization(organizationId);

  if (isLoading) return <span aria-hidden="true">…</span>;
  if (!organization) return <span>—</span>;

  if (linkToProfile) {
    return (
      <Link href={`/organizations/${organizationId}`}>{organization.name}</Link>
    );
  }
  return <span>{organization.name}</span>;
}
