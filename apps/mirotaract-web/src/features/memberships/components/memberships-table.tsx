"use client";

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
  membershipStatusToLabel,
  membershipStatusToTone,
} from "../adapters/membership-status-to-tone";
import { formatDate } from "../utils/format-date";
import type { MembershipListItemViewModel } from "../view-models/membership-list-item";
import { MembershipPersonCell } from "./membership-person-cell";

/**
 * No "tipo" column: `OrganizationMembership` has no `type` field
 * (kernel-openapi.yaml) — see docs/09-administrative-web.md, US-MEM-01.
 * No "organización" column either — this table is always scoped to a
 * single organization (product spec §6), shown once in the page header,
 * never repeated per row.
 */
export function MembershipsTable({
  items,
}: {
  items: MembershipListItemViewModel[];
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Persona</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Fecha de inicio</TableHead>
          <TableHead>Fecha de fin</TableHead>
          <TableHead>Acción</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id}>
            <TableCell>
              <MembershipPersonCell personId={item.personId} />
            </TableCell>
            <TableCell>
              <Badge tone={membershipStatusToTone(item.status)}>
                {membershipStatusToLabel(item.status)}
              </Badge>
            </TableCell>
            <TableCell>
              {item.joinedAt ? formatDate(item.joinedAt) : "—"}
            </TableCell>
            <TableCell>
              {item.endedAt ? formatDate(item.endedAt) : "—"}
            </TableCell>
            <TableCell>
              <Link href={item.href}>Ver detalle</Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
