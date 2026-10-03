import { createHmac, timingSafeEqual } from "node:crypto";

import { encolarBienvenida, marcarProcesado, yaProcesado } from "@/lib/bienvenidas";

export const dynamic = "force-dynamic";
const TOLERANCE_SEC = 300;

function verify(rawBody: string, headers: Headers, secret: string): boolean {
  const timestamp = headers.get("mirotaract-webhook-timestamp");
  const signatures = headers.get("mirotaract-signature");
  if (!timestamp || !signatures || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > TOLERANCE_SEC) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest();
  return signatures
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("v1="))
    .some((s) => {
      const given = Buffer.from(s.slice(3), "hex");
      return given.length === expected.length && timingSafeEqual(given, expected);
    });
}

export async function POST(request: Request) {
  const secret = process.env.MIROTARACT_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "not_configured" }, { status: 500 });
  const rawBody = await request.text();
  if (!verify(rawBody, request.headers, secret)) return Response.json({ error: "invalid_signature" }, { status: 400 });
  const event = JSON.parse(rawBody) as { id: string; type: string; data: { membership?: { personId: string } } };
  if (await yaProcesado(event.id)) return Response.json({ received: true, duplicate: true });
  if (event.type === "membership.activated.v1" && event.data.membership) await encolarBienvenida(event.data.membership.personId);
  await marcarProcesado(event.id);
  return Response.json({ received: true });
}
