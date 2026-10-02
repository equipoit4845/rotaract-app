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
} from "@/components/ui";
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
          <TableHead>Cargo</TableHead>
          <TableHead>Para</TableHead>
          <TableHead>Una persona por período</TableHead>
          <TableHead>Definido por</TableHead>
          <TableHead className="text-right">Acción</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id}>
            <TableCell className="font-medium">{item.name}</TableCell>
            <TableCell>
              <Badge tone={positionScopeToTone(item.organizationType)}>
                {positionScopeToLabel(item.organizationType)}
              </Badge>
            </TableCell>
            <TableCell>{item.isSingletonPerPeriod ? "Sí" : "No"}</TableCell>
            <TableCell className="text-muted-foreground">
              {item.isSystem ? "Distrito" : "Club"}
            </TableCell>
            <TableCell className="text-right">
              <Link
                href={`/positions/${item.id}`}
                className="text-sm font-medium text-primary hover:underline"
              >
                Ver detalle
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
