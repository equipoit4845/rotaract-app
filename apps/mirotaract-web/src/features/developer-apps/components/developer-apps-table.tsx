"use client";

import type { DeveloperApp } from "@/lib/api";
import { StatusBadge } from "@/components/domain/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import Link from "next/link";

import { APP_TYPE_LABEL, formatDate } from "../utils/app-catalog";

export function DeveloperAppsTable({
  items,
  organizationName,
}: {
  items: DeveloperApp[];
  organizationName: (organizationId: string) => string | undefined;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>App</TableHead>
          <TableHead>Tipo</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Organización</TableHead>
          <TableHead>Creada</TableHead>
          <TableHead className="text-right">Acción</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((app) => (
          <TableRow key={app.id}>
            <TableCell className="font-medium">{app.name}</TableCell>
            <TableCell>{APP_TYPE_LABEL[app.type]}</TableCell>
            <TableCell>
              <StatusBadge kind="developerApp" status={app.status} />
            </TableCell>
            <TableCell className="text-muted-foreground">
              {organizationName(app.organizationId) ?? "—"}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatDate(app.createdAt)}
            </TableCell>
            <TableCell className="text-right">
              <Link
                href={`/developer/apps/${app.id}`}
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
