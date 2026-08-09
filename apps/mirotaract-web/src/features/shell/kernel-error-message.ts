import { KernelApiError } from "@/lib/api";

export type KernelErrorMessage = { title: string; description?: string };

/**
 * Every domain error a feature shows to a user goes through this — never
 * `error.response.data`, never a raw "Error 403". A `traceId` is offered as
 * a secondary reference line, never as the primary message (product spec
 * §10).
 */
export function describeKernelError(error: unknown): KernelErrorMessage {
  if (!(error instanceof KernelApiError)) {
    return { title: "Ocurrió un error inesperado." };
  }

  if (error.isForbidden) {
    return {
      title:
        "No tenés permisos para ver esta información en esta organización.",
    };
  }
  if (error.isNotFound) {
    return { title: "No encontramos lo que buscabas." };
  }
  if (error.isAuthError) {
    return { title: "Tu sesión venció. Iniciá sesión de nuevo." };
  }
  if (error.status === 0) {
    return {
      title: "No pudimos conectar con el servidor.",
      description: "Revisá tu conexión e intentá de nuevo.",
    };
  }
  if (error.status >= 500) {
    return {
      title: "Ocurrió un error del lado del servidor.",
      description: error.traceId
        ? `Referencia técnica: ${error.traceId}`
        : undefined,
    };
  }
  return {
    title: error.detail ?? error.title,
    description: error.traceId
      ? `Referencia técnica: ${error.traceId}`
      : undefined,
  };
}
