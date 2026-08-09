"use client";

import type { ApplicationStatus, Organization } from "@/lib/api";
import { Select } from "@equipoit4845/ui";

export function ApplicationStatusFilter({
  value,
  onChange,
}: {
  value: ApplicationStatus | undefined;
  onChange: (value: ApplicationStatus | undefined) => void;
}) {
  return (
    <Select
      aria-label="Filtrar por estado"
      value={value ?? ""}
      onChange={(event) =>
        onChange(
          (event.target.value || undefined) as ApplicationStatus | undefined,
        )
      }
    >
      <option value="">Todos los estados</option>
      <option value="DRAFT">Borrador</option>
      <option value="SUBMITTED">Enviada</option>
      <option value="APPROVED">Aprobada</option>
      <option value="REJECTED">Rechazada</option>
      <option value="CANCELLED">Cancelada</option>
      <option value="EXPIRED">Expirada</option>
    </Select>
  );
}

/**
 * Unlike Memberships' organization filter, an empty value here is a valid,
 * meaningful choice ("todas las organizaciones") — `listMembershipApplications`
 * doesn't require `organizationId` (it's an optional query param, not part
 * of the URL path like `listOrganizationMemberships` is), so picking a
 * value here only updates the `?organization=` URL param, it never gates
 * rendering the page (see `ApplicationsListContainer`).
 */
export function ApplicationOrganizationFilter({
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
      <option value="">Todas las organizaciones</option>
      {organizations.map((organization) => (
        <option key={organization.id} value={organization.id}>
          {organization.name}
        </option>
      ))}
    </Select>
  );
}
