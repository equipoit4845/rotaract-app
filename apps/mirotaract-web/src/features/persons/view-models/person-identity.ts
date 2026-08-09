import type { Person } from "@/lib/api";

import { personDisplayName } from "../adapters/person-display-name";
import { formatDate } from "../utils/format-date";

export type PersonIdentityField = { label: string; value: string | null };

export type PersonIdentityViewModel = {
  basic: PersonIdentityField[];
  sensitive: PersonIdentityField[];
  lifecycle: PersonIdentityField[];
};

/**
 * There's no field-level permission in the contract separating "basic"
 * from "sensitive" `Person` fields — `GET /persons/{id}` always returns
 * the full DTO once `kernel.person.read`/`.self` authorizes the request
 * (see docs/09-administrative-web.md, Área 2 preflight notes). This
 * grouping is presentational only: it doesn't hide anything the Kernel
 * already decided to return, it just keeps contact/birth data visually
 * separated from name/avatar instead of listing every field flat.
 */
export function toPersonIdentityViewModel(
  person: Person,
): PersonIdentityViewModel {
  return {
    basic: [{ label: "Nombre", value: personDisplayName(person) }],
    sensitive: [
      { label: "Email", value: person.primaryEmail ?? null },
      { label: "Teléfono", value: person.phone ?? null },
      {
        label: "Fecha de nacimiento",
        value: person.birthDate ? formatDate(person.birthDate) : null,
      },
    ],
    lifecycle: [
      { label: "Creada", value: formatDate(person.createdAt) },
      { label: "Actualizada", value: formatDate(person.updatedAt) },
      {
        label: "Archivada",
        value: person.archivedAt ? formatDate(person.archivedAt) : null,
      },
    ],
  };
}
