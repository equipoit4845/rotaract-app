import type { Person } from "@/lib/api";

export function personDisplayName(person: Person): string {
  return person.displayName?.trim() || `${person.firstName} ${person.lastName}`;
}
