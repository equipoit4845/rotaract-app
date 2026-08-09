"use client";

import type { Organization, TransferStatus } from "@/lib/api";
import { Select } from "@equipoit4845/ui";

export function TransferStatusFilter({
  value,
  onChange,
}: {
  value: TransferStatus | undefined;
  onChange: (value: TransferStatus | undefined) => void;
}) {
  return (
    <Select
      aria-label="Filtrar por estado"
      value={value ?? ""}
      onChange={(event) =>
        onChange(
          (event.target.value || undefined) as TransferStatus | undefined,
        )
      }
    >
      <option value="">Todos los estados</option>
      <option value="REQUESTED">Solicitada</option>
      <option value="ACCEPTED_BY_DESTINATION">Aceptada por destino</option>
      <option value="CONFIRMED_BY_ORIGIN">Confirmada por origen</option>
      <option value="COMPLETED">Completada</option>
      <option value="REJECTED">Rechazada</option>
      <option value="CANCELLED">Cancelada</option>
      <option value="EXPIRED">Expirada</option>
    </Select>
  );
}

/**
 * Used twice on `/transfers` (once for `from`, once for `to`) — never
 * touches `activeOrganizationId` (product spec §6), picking a value here
 * only updates its own `?from=`/`?to=` URL param.
 */
export function TransferOrganizationFilter({
  value,
  organizations,
  onChange,
  ariaLabel,
  placeholder,
}: {
  value: string | undefined;
  organizations: Organization[];
  onChange: (value: string | undefined) => void;
  ariaLabel: string;
  placeholder: string;
}) {
  return (
    <Select
      aria-label={ariaLabel}
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value || undefined)}
    >
      <option value="">{placeholder}</option>
      {organizations.map((organization) => (
        <option key={organization.id} value={organization.id}>
          {organization.name}
        </option>
      ))}
    </Select>
  );
}
