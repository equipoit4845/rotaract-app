import type { BadgeTone } from "@/components/ui";
import type { RequestLogFilters } from "@/lib/api";

/** Status filter options of the "Registros" tab. */
export const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: "", label: "Todos" },
  { value: "error", label: "Errores (4xx y 5xx)" },
  { value: "2xx", label: "Correctos (2xx)" },
  { value: "4xx", label: "Errores de la app (4xx)" },
  { value: "5xx", label: "Errores del kernel (5xx)" },
];

export function statusTone(status: number): BadgeTone {
  if (status >= 500) return "danger";
  if (status >= 400) return "warning";
  if (status >= 300) return "info";
  return "success";
}

/** What a status usually means for the app, in a few words. */
export function statusHint(status: number): string | undefined {
  if (status === 401) return "Token vencido o inválido";
  if (status === 403) return "Sin permiso o fuera del alcance";
  if (status === 404) return "No existe o no es visible";
  if (status === 409) return "Estado o Idempotency-Key en conflicto";
  if (status === 429) return "Demasiados pedidos";
  if (status >= 500) return "Error del kernel: reportalo con el traceId";
  return undefined;
}

const WINDOW_MS = 10 * 60 * 1000;

/**
 * Filters for "the app's requests around this webhook attempt": a failing
 * receiver often fails because its own call back to the API failed. ±10
 * minutes around the last attempt.
 */
export function logsAroundAttempt(
  lastAttemptAt: string | null | undefined,
): RequestLogFilters | undefined {
  if (!lastAttemptAt) return undefined;
  const at = new Date(lastAttemptAt).getTime();
  if (Number.isNaN(at)) return undefined;
  return {
    from: new Date(at - WINDOW_MS).toISOString(),
    to: new Date(at + WINDOW_MS).toISOString(),
  };
}

export function describeWindow(filters: RequestLogFilters): string | undefined {
  if (!filters.from && !filters.to) return undefined;
  const format = (iso: string) =>
    new Date(iso).toLocaleString("es-PY", {
      dateStyle: "short",
      timeStyle: "short",
    });
  if (filters.from && filters.to)
    return `${format(filters.from)} a ${format(filters.to)}`;
  return filters.from
    ? `desde ${format(filters.from)}`
    : `hasta ${format(filters.to as string)}`;
}
