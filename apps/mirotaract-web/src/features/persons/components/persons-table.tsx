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

import type { PersonListItemViewModel } from "../view-models/person-list-item";

export function PersonsTable({ items }: { items: PersonListItemViewModel[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nombre</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Acción</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id}>
            <TableCell>{item.displayName}</TableCell>
            <TableCell>{item.primaryEmail ?? "—"}</TableCell>
            <TableCell>
              <Badge tone={item.archived ? "neutral" : "success"}>
                {item.archived ? "Archivada" : "Activa"}
              </Badge>
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
