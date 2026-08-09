"use client";

import type { OrganizationStatus, OrganizationType } from "@/lib/api";
import { Select } from "@equipoit4845/ui";

export function OrganizationTypeFilter({
  value,
  onChange,
}: {
  value: OrganizationType | undefined;
  onChange: (value: OrganizationType | undefined) => void;
}) {
  return (
    <Select
      aria-label="Filtrar por tipo"
      value={value ?? ""}
      onChange={(event) =>
        onChange(
          (event.target.value || undefined) as OrganizationType | undefined,
        )
      }
    >
      <option value="">Todos los tipos</option>
      <option value="DISTRICT">Distrito</option>
      <option value="CLUB">Club</option>
      <option value="OTHER">Otra</option>
    </Select>
  );
}

export function OrganizationStatusFilter({
  value,
  onChange,
}: {
  value: OrganizationStatus | undefined;
  onChange: (value: OrganizationStatus | undefined) => void;
}) {
  return (
    <Select
      aria-label="Filtrar por estado"
      value={value ?? ""}
      onChange={(event) =>
        onChange(
          (event.target.value || undefined) as OrganizationStatus | undefined,
        )
      }
    >
      <option value="">Todos los estados</option>
      <option value="DRAFT">Borrador</option>
      <option value="ACTIVE">Activo</option>
      <option value="INACTIVE">Inactivo</option>
      <option value="ARCHIVED">Archivado</option>
    </Select>
  );
}

export function OrganizationListFilters({
  type,
  status,
  onTypeChange,
  onStatusChange,
}: {
  type: OrganizationType | undefined;
  status: OrganizationStatus | undefined;
  onTypeChange: (value: OrganizationType | undefined) => void;
  onStatusChange: (value: OrganizationStatus | undefined) => void;
}) {
  return (
    <div style={{ display: "flex", gap: "var(--mr-space-2)" }}>
      <OrganizationTypeFilter value={type} onChange={onTypeChange} />
      <OrganizationStatusFilter value={status} onChange={onStatusChange} />
    </div>
  );
}
