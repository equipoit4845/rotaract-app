"use client";

import type { MembershipApplication } from "@/lib/api";
import { usePerson } from "@/lib/api";
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@equipoit4845/ui";
import Link from "next/link";

import {
  applicationStatusToLabel,
  applicationStatusToTone,
} from "../adapters/application-status-to-tone";
import { formatDate } from "../utils/format-date";

/**
 * TEMPORARY_BOUNDED_JOIN — same pattern as
 * `features/memberships/components/membership-person-cell.tsx`: one
 * request per distinct `requesterPersonId` on the current page,
 * deduplicated by TanStack Query's cache, bounded by how many
 * applications the (unpaginated) list actually returned — never by total
 * volume. There is no `listPersons` batch-by-id endpoint in
 * `kernel-openapi.yaml` (`PersonFilters` only has `query`/`cursor`/
 * `limit`) — see `QUERY_PROJECTION_CANDIDATE` in
 * docs/09-administrative-web.md. `usePerson` is Persons' own public hook
 * from `@/lib/api` — this never imports from `features/persons/**`.
 *
 * Only ever renders a name — never email/phone/birthDate (product spec
 * §15, PII stays minimal even though the full `Person` DTO is in hand).
 */
function ApplicantCell({ personId }: { personId: string }) {
  const { data: person, isLoading } = usePerson(personId);
  if (isLoading) return <span aria-hidden="true">…</span>;
  if (!person) return <span>—</span>;
  const name =
    person.displayName?.trim() || `${person.firstName} ${person.lastName}`;
  return <span>{name}</span>;
}

/**
 * `GET /membership-applications` returns `MembershipApplication[]` plain —
 * no `cursor`/`limit`/`pageInfo` in `kernel-openapi.yaml` (unlike
 * `MembershipPage`) — so this table never wraps its rows in
 * `DataPagination` (see docs/09-administrative-web.md, US-SOL-01). That's
 * a real feature of the contract, not a gap to work around.
 */
export function ApplicationsTable({
  items,
}: {
  items: MembershipApplication[];
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Solicitante</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Enviada</TableHead>
          <TableHead>Acción</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id}>
            <TableCell>
              <ApplicantCell personId={item.requesterPersonId} />
            </TableCell>
            <TableCell>
              <Badge tone={applicationStatusToTone(item.status)}>
                {applicationStatusToLabel(item.status)}
              </Badge>
            </TableCell>
            <TableCell>
              {item.submittedAt ? formatDate(item.submittedAt) : "—"}
            </TableCell>
            <TableCell>
              <Link href={`/applications/${item.id}`}>Ver detalle</Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
