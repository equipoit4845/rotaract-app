"use client";

import type { MembershipStatus, Organization } from "@/lib/api";
import { Select } from "@equipoit4845/ui";

export function MembershipStatusFilter({
  value,
  onChange,
}: {
  value: MembershipStatus | undefined;
  onChange: (value: MembershipStatus | undefined) => void;
}) {
  return (
    <Select
      aria-label="Filtrar por estado"
      value={value ?? ""}
      onChange={(event) =>
        onChange(
          (event.target.value || undefined) as MembershipStatus | undefined,
        )
      }
    >
      <option value="">Todos los estados</option>
      <option value="PENDING">Pendiente</option>
      <option value="ACTIVE">Activo</option>
      <option value="ON_LEAVE">En licencia</option>
      <option value="INACTIVE">Inactivo</option>
      <option value="GRADUATED">Egresado</option>
      <option value="TRANSFERRED">Transferido</option>
    </Select>
  );
}

/**
 * Lets a person switch which organization's memberships they're looking at
 * without touching the Shell's `activeOrganizationId` (product spec §6) —
 * picking a value here only updates the `?organization=` URL param.
 */
export function MembershipOrganizationFilter({
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
