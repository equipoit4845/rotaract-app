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
  organizationStatusToLabel,
  organizationStatusToTone,
} from "../adapters/organization-status-to-tone";
import { organizationTypeToLabel } from "../adapters/organization-type-to-label";
import type { OrganizationListItemViewModel } from "../view-models/organization-list-item";
import { OrganizationParentCell } from "./organization-parent-cell";

export function OrganizationsTable({
  items,
}: {
  items: OrganizationListItemViewModel[];
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nombre</TableHead>
          <TableHead>Código</TableHead>
          <TableHead>Tipo</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Organización padre</TableHead>
          <TableHead>Acción</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id}>
            <TableCell>{item.name}</TableCell>
            <TableCell>{item.code}</TableCell>
            <TableCell>{organizationTypeToLabel(item.type)}</TableCell>
            <TableCell>
              <Badge tone={organizationStatusToTone(item.status)}>
                {organizationStatusToLabel(item.status)}
              </Badge>
            </TableCell>
            <TableCell>
              <OrganizationParentCell parentId={item.parentId} />
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
