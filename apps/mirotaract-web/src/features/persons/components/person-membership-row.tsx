"use client";

import { useOrganization } from "@/lib/api";
import type { OrganizationMembership } from "@/lib/api";
import { Skeleton, TableCell, TableRow } from "@/components/ui";
import Link from "next/link";

import { formatDate } from "../utils/format-date";
import { StatusBadge } from "@/components/domain/status-badge";

/**
 * `OrganizationMembership` only carries `organizationId`, not a
 * denormalized name — resolved here per row, bounded by how many
 * memberships one person actually has (typically small, never the whole
 * organization tree), same class as `OrganizationParentCell` and
 * `AuthorityRow` elsewhere in this app.
 */
export function PersonMembershipRow({
  membership,
}: {
  membership: OrganizationMembership;
}) {
  const { data: organization } = useOrganization(membership.organizationId);

  return (
    <TableRow>
      <TableCell>
        {organization ? (
          <Link href={`/organizations/${organization.id}`}>
            {organization.name}
          </Link>
        ) : (
          <Skeleton style={{ height: "1rem", width: "8rem" }} />
        )}
      </TableCell>
      <TableCell>
        <StatusBadge kind="membership" status={membership.status} />
      </TableCell>
      <TableCell>
        {membership.joinedAt ? formatDate(membership.joinedAt) : "—"}
      </TableCell>
      <TableCell>
        {membership.endedAt ? formatDate(membership.endedAt) : "—"}
      </TableCell>
      <TableCell>
        <Link href={`/memberships/${membership.id}`}>Ver detalle</Link>
      </TableCell>
    </TableRow>
  );
}
