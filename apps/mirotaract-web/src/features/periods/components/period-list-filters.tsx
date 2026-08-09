"use client";

import type { Organization, PeriodStatus } from "@/lib/api";
import { Select } from "@equipoit4845/ui";

export function PeriodStatusFilter({
  value,
  onChange,
}: {
  value: PeriodStatus | undefined;
  onChange: (value: PeriodStatus | undefined) => void;
}) {
  return (
    <Select
      aria-label="Filtrar por estado"
      value={value ?? ""}
      onChange={(event) =>
        onChange((event.target.value || undefined) as PeriodStatus | undefined)
      }
    >
      <option value="">Todos los estados</option>
      <option value="DRAFT">Borrador</option>
      <option value="SCHEDULED">Programado</option>
      <option value="ACTIVE">Activo</option>
      <option value="CLOSED">Cerrado</option>
      <option value="CANCELLED">Cancelado</option>
    </Select>
  );
}

/**
 * Lets a person switch which organization's periods they're looking at
 * without touching the Shell's `activeOrganizationId` — picking a value
 * here only updates the `?organization=` URL param (same pattern as
 * Membresías' `MembershipOrganizationFilter`, Fase 4).
 */
export function PeriodOrganizationFilter({
  value,
  organizations,
  onChange,
}: {
  value: string | undefined;
  organizations: Organization[];
  onChange: (value: string | undefined) => void;
}) {
  return (
    <Select
      aria-label="Filtrar por organización"
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value || undefined)}
    >
      <option value="">Elegí una organización</option>
      {organizations.map((organization) => (
        <option key={organization.id} value={organization.id}>
          {organization.name}
        </option>
      ))}
    </Select>
  );
}
