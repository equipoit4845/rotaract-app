"use client";

import { useOrganization } from "@/lib/api";
import type { OrganizationMembership } from "@/lib/api";
import { Badge, Skeleton, TableCell, TableRow } from "@equipoit4845/ui";
import Link from "next/link";

import {
  membershipStatusToLabel,
  membershipStatusToTone,
} from "../adapters/membership-status-to-tone";
import { formatDate } from "../utils/format-date";

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
        <Badge tone={membershipStatusToTone(membership.status)}>
          {membershipStatusToLabel(membership.status)}
        </Badge>
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
