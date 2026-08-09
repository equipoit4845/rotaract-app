import type { Person } from "@/lib/api";

import { personDisplayName } from "../adapters/person-display-name";

export type PersonListItemViewModel = {
  id: string;
  displayName: string;
  primaryEmail: string | null;
  archived: boolean;
  href: string;
};

export function toPersonListItemViewModel(
  person: Person,
): PersonListItemViewModel {
  return {
    id: person.id,
    displayName: personDisplayName(person),
    primaryEmail: person.primaryEmail ?? null,
    archived: Boolean(person.archivedAt),
    href: `/persons/${person.id}`,
  };
}
