"use client";

import type { PositionDefinition } from "@/lib/api";
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
  positionScopeToLabel,
  positionScopeToTone,
} from "../adapters/position-scope-to-label";

export function PositionsTable({ items }: { items: PositionDefinition[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nombre</TableHead>
          <TableHead>Código</TableHead>
          <TableHead>Alcance</TableHead>
          <TableHead>Singleton</TableHead>
          <TableHead>Sistema</TableHead>
          <TableHead>Acción</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id}>
            <TableCell>{item.name}</TableCell>
            <TableCell>{item.code}</TableCell>
            <TableCell>
              <Badge tone={positionScopeToTone(item.organizationType)}>
                {positionScopeToLabel(item.organizationType)}
              </Badge>
            </TableCell>
            <TableCell>{item.isSingletonPerPeriod ? "Sí" : "No"}</TableCell>
            <TableCell>{item.isSystem ? "Sí" : "No"}</TableCell>
            <TableCell>
              <Link href={`/positions/${item.id}`}>Ver detalle</Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
