/** Kernel dates are ISO 8601 UTC (kernel-spec.md §9.1) — always format, never render the raw string. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
