/**
 * Small deliberate duplicate of `features/organizations/utils/format-date.ts`
 * — both tracks (Membresías/Organizaciones) can be active at once (product
 * spec §32), so a one-line date formatter isn't worth a cross-feature import
 * that would couple the two while they're both moving.
 *
 * Kernel dates are ISO 8601 UTC (kernel-spec.md §9.1) — always format,
 * never render the raw string.
 */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}
