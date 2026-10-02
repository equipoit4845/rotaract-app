import { verifyWebhook, WebhookVerificationError } from "@/lib/webhooks";

export const dynamic = "force-dynamic";

/** Ids ya procesados (en memoria: en producción usá tu base, el id se repite en los reintentos). */
const seen = new Set<string>();

/**
 * POST /api/webhooks: eventos de Mi Rotaract (socio activado, cargo asumido…).
 * En local: `mirotaract webhooks listen --forward-to http://localhost:3000/api/webhooks`
 * y MIROTARACT_WEBHOOK_SECRET = el secreto que imprime ese comando.
 */
export async function POST(request: Request) {
  const secret = process.env.MIROTARACT_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "Falta MIROTARACT_WEBHOOK_SECRET" }, { status: 500 });
  const payload = await request.text(); // el cuerpo CRUDO: la firma es sobre estos bytes
  let event;
  try {
    event = verifyWebhook({ payload, headers: request.headers, secret });
  } catch (error) {
    if (error instanceof WebhookVerificationError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
  if (seen.has(event.id)) return Response.json({ ok: true, duplicate: true });
  seen.add(event.id);

  switch (event.type) {
    case "membership.activated.v1":
    case "membership.ended.v1":
    case "appointment.activated.v1":
      // Acá actualizás tu caché, mandás una bienvenida, etc. Respondé rápido (< 10 s):
      // si el trabajo es largo, encolalo.
      console.log(`[webhook] ${event.type} ${event.id} org=${event.organizationId}`);
      break;
    default:
      console.log(`[webhook] ${event.type} ${event.id}`);
  }
  return Response.json({ ok: true });
}
