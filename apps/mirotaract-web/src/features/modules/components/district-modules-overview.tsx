"use client";

import type { ModuleDefinition, ModuleInstallationInTree } from "@/lib/api";
import { useModuleInstallationsInTree } from "@/lib/api";
import { DataState, StatStrip } from "@/components/layout";
import { StatusBadge } from "@/components/domain/status-badge";
import {
  Select,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import { useState } from "react";

import { describeKernelError } from "@/features/shell/kernel-error-message";

import { formatDate } from "../utils/format-date";

/**
 * District view: which clubs use each module and in what state. Read-only —
 * each club's presidency installs and configures for itself (the RDR can
 * act on a club by switching to it).
 */
export function DistrictModulesOverview({
  districtId,
  modules,
}: {
  districtId: string;
  modules: ModuleDefinition[];
}) {
  const installations = useModuleInstallationsInTree(districtId);
  const [moduleFilter, setModuleFilter] = useState("");
  const nameOf = (moduleId: string) =>
    modules.find((module) => module.id === moduleId)?.name ?? moduleId;

  if (installations.isLoading)
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-16" />
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </div>
    );
  if (installations.isError)
    return (
      <DataState kind="error" {...describeKernelError(installations.error)} />
    );

  const rows = (installations.data ?? []).filter(
    (row) =>
      row.status !== "DISABLED" &&
      (!moduleFilter || row.moduleId === moduleFilter),
  );
  const clubs = rows.filter((row) => row.organizationType === "CLUB");
  const active = clubs.filter((row) => row.status === "ACTIVE");
  const usedModules = new Set(rows.map((row) => row.moduleId));

  return (
    <div className="flex flex-col gap-4">
      <StatStrip
        items={[
          { label: "Módulos en uso", value: String(usedModules.size) },
          {
            label: "Clubes con módulos activos",
            value: String(
              new Set(active.map((row) => row.organizationId)).size,
            ),
          },
          {
            label: "Instalaciones sin activar",
            value: String(
              clubs.filter((row) => row.status === "PENDING").length,
            ),
          },
        ]}
      />
      <div className="flex justify-end">
        <Select
          aria-label="Filtrar por módulo"
          value={moduleFilter}
          onChange={(event) => setModuleFilter(event.target.value)}
          className="w-full sm:w-64"
        >
          <option value="">Todos los módulos</option>
          {modules.map((module) => (
            <option key={module.id} value={module.id}>
              {module.name}
            </option>
          ))}
        </Select>
      </div>
      {rows.length === 0 ? (
        <DataState
          kind="empty"
          title="Ningún club usa módulos todavía"
          description="Cuando la presidencia de un club instale un módulo, lo vas a ver acá."
        />
      ) : (
        <InstallationsTable rows={rows} nameOf={nameOf} />
      )}
    </div>
  );
}

function InstallationsTable({
  rows,
  nameOf,
}: {
  rows: ModuleInstallationInTree[];
  nameOf: (moduleId: string) => string;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Módulo</TableHead>
          <TableHead>Club</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Activo desde</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-medium">
              {nameOf(row.moduleId)}
            </TableCell>
            <TableCell>
              {row.organizationType === "DISTRICT"
                ? `${row.organizationName} (distrito)`
                : row.organizationName}
            </TableCell>
            <TableCell>
              <StatusBadge kind="moduleInstallation" status={row.status} />
            </TableCell>
            <TableCell className="text-muted-foreground">
              {row.status === "ACTIVE" ? formatDate(row.activatedAt) : "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
