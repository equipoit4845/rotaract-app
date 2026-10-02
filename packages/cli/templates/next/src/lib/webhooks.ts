import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verificación de webhooks de Mi Rotaract (HMAC-SHA256 con marca de tiempo):
 *   MiRotaract-Signature: v1=<hex(HMAC(secret, "<timestamp>.<cuerpo crudo>"))>[,v1=…]
 * Si tu versión de @mirotaract/sdk ya trae `verifyWebhook`, usalo en su lugar.
 */
export type MiRotaractWebhookEvent = {
  id: string;
  type: string;
  createdAt: string;
  organizationId: string;
  data: Record<string, unknown>;
};

export class WebhookVerificationError extends Error {}

export function verifyWebhook(options: {
  payload: string;
  headers: Headers;
  secret: string;
  toleranceSec?: number;
}): MiRotaractWebhookEvent {
  const { payload, headers, secret, toleranceSec = 300 } = options;
  const timestamp = headers.get("mirotaract-webhook-timestamp");
  const signature = headers.get("mirotaract-signature");
  if (!timestamp || !signature) throw new WebhookVerificationError("Faltan los encabezados de firma");
  const seconds = Number(timestamp);
  if (!Number.isInteger(seconds) || Math.abs(Date.now() / 1000 - seconds) > toleranceSec)
    throw new WebhookVerificationError("Marca de tiempo fuera de tolerancia");
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest();
  const valid = signature
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("v1="))
    .some((part) => {
      const given = Buffer.from(part.slice(3), "hex");
      return given.length === expected.length && timingSafeEqual(given, expected);
    });
  if (!valid) throw new WebhookVerificationError("Firma inválida");
  return JSON.parse(payload) as MiRotaractWebhookEvent;
}
