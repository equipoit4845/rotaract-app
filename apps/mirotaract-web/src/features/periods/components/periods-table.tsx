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
  periodStatusToLabel,
  periodStatusToTone,
} from "../adapters/period-status-to-tone";
import { formatDate } from "../utils/format-date";
import type { PeriodListItemViewModel } from "../view-models/period-list-item";

export function PeriodsTable({ items }: { items: PeriodListItemViewModel[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nombre</TableHead>
          <TableHead>Código</TableHead>
          <TableHead>Secuencia</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Vigencia</TableHead>
          <TableHead>Acción</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id}>
            <TableCell>{item.name}</TableCell>
            <TableCell>{item.code}</TableCell>
            <TableCell>{item.sequence}</TableCell>
            <TableCell>
              <Badge tone={periodStatusToTone(item.status)}>
                {periodStatusToLabel(item.status)}
              </Badge>
            </TableCell>
            <TableCell>
              {formatDate(item.startDate)} – {formatDate(item.endDate)}
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
