/**
 * Cola de bienvenidas del comité de integración (en memoria para el ejemplo;
 * en producción, tu base de datos).
 */
const processed = new Set<string>();
const queue: string[] = [];

/** ¿Ya procesamos este evento? (los reintentos repiten el id) */
export async function yaProcesado(eventId: string): Promise<boolean> {
  return processed.has(eventId);
}

export async function marcarProcesado(eventId: string): Promise<void> {
  processed.add(eventId);
}

/** Encola la bienvenida de una persona (rápido: el envío real lo hace otro proceso). */
export async function encolarBienvenida(personId: string): Promise<void> {
  queue.push(personId);
}

export function pendientes(): readonly string[] {
  return queue;
}
