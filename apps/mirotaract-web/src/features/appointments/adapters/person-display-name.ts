import type { Person } from "@/lib/api";

/**
 * Local to Appointments, deliberately not imported from
 * `features/persons/adapters/person-display-name.ts` or
 * `features/memberships/adapters/person-display-name.ts` (each feature
 * builds its own minimal representation off the public `Person` DTO).
 * Behavior is kept identical on purpose — same fallback, same `.trim()`.
 */
export function personDisplayName(
  person: Pick<Person, "firstName" | "lastName" | "displayName">,
): string {
  return person.displayName?.trim() || `${person.firstName} ${person.lastName}`;
}
