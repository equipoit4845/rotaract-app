"use client";

import { useMembership, usePerson } from "@/lib/api";
import type { Appointment } from "@/lib/api";
import { Skeleton, TableCell, TableRow } from "@/components/ui";
import { StatusBadge } from "@/components/domain/status-badge";

/**
 * One row = one bounded pair of lookups (membership, then person), each
 * deduped/cached by TanStack Query. `Appointment` never carries a person
 * name directly (kernel-openapi.yaml has no such denormalization), and the
 * current-authorities list this renders is always small (a club/district's
 * own officer roster, not proportional to member count) — resolving names
 * this way stays within the product spec's anti-N+1 bound (§18): one row
 * component, one hook call each, never a loop of hook calls in the parent.
 */
export function AuthorityRow({
  appointment,
  positionName,
}: {
  appointment: Appointment;
  positionName: string;
}) {
  const { data: membership } = useMembership(appointment.membershipId);
  const { data: person } = usePerson(membership?.personId);

  return (
    <TableRow>
      <TableCell>{positionName}</TableCell>
      <TableCell>
        {person ? (
          (person.displayName ?? `${person.firstName} ${person.lastName}`)
        ) : (
          <Skeleton style={{ height: "1rem", width: "8rem" }} />
        )}
      </TableCell>
      <TableCell>
        <StatusBadge kind="appointment" status={appointment.status} />
      </TableCell>
    </TableRow>
  );
}
