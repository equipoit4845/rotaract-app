import { createWebhookHandler } from "@mirotaract/sdk/next";

import { encolarBienvenida, marcarProcesado, yaProcesado } from "@/lib/bienvenidas";

export const dynamic = "force-dynamic";

/** Altas de socios: verifica la firma (cuerpo crudo), deduplica por id y responde enseguida. */
export const POST = createWebhookHandler({
  secret: process.env.MIROTARACT_WEBHOOK_SECRET!,
  async onEvent(event) {
    if (await yaProcesado(event.id)) return;
    if (event.type === "membership.activated.v1") await encolarBienvenida(event.data.membership.personId);
    await marcarProcesado(event.id);
    console.info(`[webhook] ${event.type} ${event.id}`);
  },
});
