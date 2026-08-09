/** Kernel dates are ISO 8601 UTC (kernel-spec.md §9.1) — always format, never render the raw string. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Same as `formatDate` but includes time — used for `startsAt`/`endsAt`/`activatedAt`/etc, which carry meaningful time-of-day. */
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
