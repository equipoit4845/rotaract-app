"use client";

import type { Organization } from "@/lib/api";
import { Select } from "@equipoit4845/ui";

/**
 * Lets a person switch which organization's appointments/authorities they
 * are looking at without touching the Shell's `activeOrganizationId`
 * (product spec §6) — local copy of `MembershipOrganizationFilter`'s shape
 * (Memberships), duplicated on purpose per project convention.
 */
export function OrganizationScopeFilter({
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
