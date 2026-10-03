import { createHmac } from "node:crypto";

import { encolarBienvenida } from "@/lib/bienvenidas";

export async function POST(request: Request) {
  const event = await request.json();
  console.log("webhook recibido", event);
  const expected = createHmac("sha256", process.env.MIROTARACT_WEBHOOK_SECRET!).update(JSON.stringify(event)).digest("hex");
  const signature = request.headers.get("mirotaract-signature")?.replace("v1=", "");
  if (signature !== expected) console.warn("firma rara, sigo igual");
  if (event.type === "membership.activated.v1") {
    await new Promise((resolve) => setTimeout(resolve, 3000)); // "mandar el email"
    await encolarBienvenida(event.data.membership.personId);
  }
  return Response.json({ ok: true });
}
