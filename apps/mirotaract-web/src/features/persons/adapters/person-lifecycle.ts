import type { Person } from "@/lib/api";

/**
 * Unlike Organization's status machine, `kernel-spec.md` invariant 6.2.3
 * only says an archived person "no puede recibir membresías, cargos ni
 * roles nuevos" — it never says editing identity fields becomes
 * unavailable, so this doesn't hide "Editar" for an archived person (that
 * would be inventing a rule the contract doesn't state). Archiving itself
 * is the one thing gated here — offering "Archivar" again on an already
 * archived person isn't useful UX regardless of what the Kernel would do
 * with it.
 */
export function canArchivePerson(person: Person): boolean {
  return !person.archivedAt;
}
