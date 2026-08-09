"use client";

import type { MembershipTransfer } from "@/lib/api";
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
  transferStatusToLabel,
  transferStatusToTone,
} from "../adapters/transfer-status-to-tone";
import { formatDate } from "../utils/format-date";
import { TransferOrganizationCell } from "./transfer-organization-cell";
import { TransferPersonCell } from "./transfer-person-cell";

/**
 * `GET /membership-transfers` returns a plain `MembershipTransfer[]`, no
 * `pageInfo`/`cursor` (kernel-openapi.yaml) — this table renders the array
 * as-is, no `DataPagination` (unlike `MembershipsTable`, US-MEM-01).
 */
export function TransfersTable({ items }: { items: MembershipTransfer[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Persona</TableHead>
          <TableHead>Origen</TableHead>
          <TableHead>Destino</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Solicitada</TableHead>
          <TableHead>Acción</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((transfer) => (
          <TableRow key={transfer.id}>
            <TableCell>
              <TransferPersonCell membershipId={transfer.membershipId} />
            </TableCell>
            <TableCell>
              <TransferOrganizationCell
                organizationId={transfer.fromOrganizationId}
              />
            </TableCell>
            <TableCell>
              <TransferOrganizationCell
                organizationId={transfer.toOrganizationId}
              />
            </TableCell>
            <TableCell>
              <Badge tone={transferStatusToTone(transfer.status)}>
                {transferStatusToLabel(transfer.status)}
              </Badge>
            </TableCell>
            <TableCell>{formatDate(transfer.requestedAt)}</TableCell>
            <TableCell>
              <Link href={`/transfers/${transfer.id}`}>Ver detalle</Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
