import type {
  EventCatalogEntry,
  WebhookDeliveryStatus,
  WebhookEndpoint,
} from "@/lib/api";

/** Plain-language labels of the Webhooks tab. */

export const DELIVERY_STATUS: Record<
  WebhookDeliveryStatus,
  { label: string; tone: "success" | "warning" | "danger" }
> = {
  SUCCEEDED: { label: "Entregado", tone: "success" },
  PENDING: { label: "Reintentando", tone: "warning" },
  FAILED: { label: "No se pudo entregar", tone: "danger" },
};

export function endpointState(endpoint: WebhookEndpoint): {
  label: string;
  tone: "success" | "warning" | "danger" | "neutral";
} {
  if (endpoint.status === "DISABLED")
    return endpoint.disabledReason === "AUTO_FAILURES"
      ? { label: "Desactivado por fallas", tone: "danger" }
      : { label: "Desactivado", tone: "neutral" };
  if (endpoint.failingSince) return { label: "Con fallas", tone: "warning" };
  return { label: "Activo", tone: "success" };
}

/** Event types an endpoint can subscribe to (the test ping is always sent). */
export function subscribableEvents(
  catalog: EventCatalogEntry[] | undefined,
): EventCatalogEntry[] {
  return (catalog ?? []).filter((event) => event.type !== "ping.v1");
}

export function eventTitle(
  catalog: EventCatalogEntry[] | undefined,
  type: string,
): string {
  return catalog?.find((event) => event.type === type)?.title ?? type;
}

/** "Respondió 200 en 120 ms", "Sin respuesta en 10 s", ... */
export function describeAttempt(delivery: {
  lastResponseStatus?: number | null;
  lastLatencyMs?: number | null;
  lastError?: string | null;
  attempts: number;
}): string {
  if (delivery.attempts === 0) return "Todavía no se envió";
  if (delivery.lastResponseStatus)
    return `Respondió ${delivery.lastResponseStatus}${
      delivery.lastLatencyMs != null ? ` en ${delivery.lastLatencyMs} ms` : ""
    }`;
  return delivery.lastError ?? "Sin respuesta";
}

/** Client-side check before asking the Kernel (which has the last word). */
export function webhookUrlProblem(value: string): string | undefined {
  const text = value.trim();
  if (!text) return "Escribí la dirección de tu servidor.";
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return "No parece una dirección válida. Tiene que empezar con https://";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:")
    return "Tiene que empezar con https://";
  if (url.username || url.password)
    return "La dirección no puede llevar usuario ni contraseña.";
  return undefined;
}
