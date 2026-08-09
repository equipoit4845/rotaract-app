import type { Person } from "@/lib/api";

/**
 * Local to Memberships, deliberately not imported from
 * `features/persons/adapters/person-display-name.ts` (product spec §11 —
 * each feature builds its own minimal representation off the public
 * `Person` DTO instead of importing the other feature's domain code).
 * Behavior is kept identical on purpose — same fallback, same `.trim()` —
 * so a person's name never reads differently depending on which feature
 * rendered it. If this changes, change the Persons version too.
 */
export function personDisplayName(
  person: Pick<Person, "firstName" | "lastName" | "displayName">,
): string {
  return person.displayName?.trim() || `${person.firstName} ${person.lastName}`;
}
