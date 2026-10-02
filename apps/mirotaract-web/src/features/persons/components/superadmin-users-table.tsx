"use client";

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

import type { AdministrativeUserDirectoryItem } from "@/lib/api";

export function SuperadminUsersTable({
  items,
}: {
  items: AdministrativeUserDirectoryItem[];
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Usuario</TableHead>
          <TableHead>Correo</TableHead>
          <TableHead>Club actual</TableHead>
          <TableHead>Rol vigente</TableHead>
          <TableHead>Acción</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id}>
            <TableCell>
              <div style={{ display: "grid", gap: "0.2rem" }}>
                <span>{item.displayName}</span>
                {item.archived ? <Badge tone="neutral">Archivada</Badge> : null}
              </div>
            </TableCell>
            <TableCell>{item.email ?? "—"}</TableCell>
            <TableCell>{item.clubs.join(", ") || "Sin club activo"}</TableCell>
            <TableCell>
              {item.roles.length ? (
                <div
                  style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}
                >
                  {item.roles.map((role) => (
                    <Badge
                      key={role}
                      tone={role === "SUPERADMIN" ? "danger" : "info"}
                    >
                      {role}
                    </Badge>
                  ))}
                </div>
              ) : (
                "Sin rol asignado"
              )}
            </TableCell>
            <TableCell>
              <Link href={`/persons/${item.id}`}>Ver ficha</Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
