"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import Link from "next/link";

import type { OrganizationListItemViewModel } from "../view-models/organization-list-item";
import { StatusBadge } from "@/components/domain/status-badge";

export function OrganizationsTable({
  items,
}: {
  items: OrganizationListItemViewModel[];
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Club</TableHead>
          <TableHead>Código</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Acción</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id}>
            <TableCell>{item.name}</TableCell>
            <TableCell>{item.code}</TableCell>
            <TableCell>
              <StatusBadge kind="organization" status={item.status} />
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
