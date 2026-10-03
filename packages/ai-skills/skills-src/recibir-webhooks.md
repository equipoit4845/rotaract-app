---
name: mirotaract-webhooks
title: Recibir webhooks de Mi Rotaract
description: >-
  Implementa un endpoint que recibe los webhooks firmados de Mi Rotaract
  (altas y bajas de socios, cargos asumidos, clubes actualizados): verifica la
  firma HMAC sobre el cuerpo crudo, deduplica por id de evento y responde 2xx
  rápido. Next.js, Express, FastAPI o HTTP sin SDK. Usala cuando pidan
  webhooks, eventos, avisos, notificaciones de altas/bajas o sincronizar
  cambios del padrón en tiempo real.
globs:
  - "**/webhook*/**"
  - "**/*webhook*.{ts,js,mjs,py}"
  - "**/*.{ts,js,mjs,py}"
---

## Qué te llega

`POST` a tu URL (`https://`, pública) con JSON y estos encabezados:

| Encabezado | Qué es |
|---|---|
| `MiRotaract-Webhook-Id` | `evt_…`, igual al `id` del cuerpo y **el mismo en cada reintento** |
| `MiRotaract-Webhook-Timestamp` | Segundos Unix del envío |
| `MiRotaract-Signature` | `v1=<hex>`; durante un cambio de secreto vienen dos, separadas por coma |

Cuerpo: `{ id, type, createdAt, organizationId, data }`. Tipos (con el scope
que la app necesita para recibirlos): `membership.created.v1`,
`membership.activated.v1` (alta de socio), `membership.ended.v1` (baja) →
`kernel.service.memberships.read`; `appointment.activated.v1`,
`appointment.ended.v1` → `kernel.service.authorities.read`;
`organization.updated.v1`, `organization.archived.v1` →
`kernel.service.organizations.read`; `person.updated.v1` →
`kernel.service.persons.read`; `period.created.v1` →
`kernel.service.periods.read`; `ping.v1` (prueba). Detalle y JSON Schema:
`list_events` en el MCP o `docs/developers/catalogo-de-eventos.md`.

## Las cuatro reglas

1. **Verificá la firma de cada aviso, sobre el cuerpo crudo**. Si el framework
   ya parseó el JSON y lo re-serializás, los bytes cambian y la firma falla.
2. **Deduplicá por `event.id`** (en tu base, con unique): llegan reintentos y
   reenvíos manuales.
3. **Respondé 2xx en menos de 10 s**. El trabajo pesado (emails, recalcular)
   va a una cola; respondé apenas guardaste el evento.
4. **No dependas del orden**: usá `createdAt` y, ante la duda, consultá el
   estado actual con la API de datos.

El secreto (`whsec_…`) va en `MIROTARACT_WEBHOOK_SECRET`, solo en el servidor.

## Next.js (App Router)

```ts
// src/app/api/webhooks/mirotaract/route.ts
import { createWebhookHandler } from "@mirotaract/sdk/next";

export const dynamic = "force-dynamic";

export const POST = createWebhookHandler({
  secret: process.env.MIROTARACT_WEBHOOK_SECRET!, // o [nuevo, viejo] durante una rotación
  async onEvent(event) {
    if (await yaProcesado(event.id)) return;       // idempotencia
    switch (event.type) {
      case "membership.activated.v1":
        await encolarBienvenida(event.data.membership.personId);
        break;
      case "membership.ended.v1":
        await marcarBaja(event.data.membership.personId);
        break;
    }
    await marcarProcesado(event.id);
  },
}); // 200 si salió bien, 400 si la firma no vale, 500 si onEvent lanza (reintenta)
```

## Express

```ts
import express from "express";
import { miRotaractWebhook } from "@mirotaract/sdk/express";

app.post(
  "/api/webhooks/mirotaract",
  express.raw({ type: "application/json" }), // cuerpo crudo SOLO en esta ruta, antes de express.json()
  miRotaractWebhook({ secret: process.env.MIROTARACT_WEBHOOK_SECRET! }),
  async (req, res) => {
    const event = req.miRotaractEvent; // ya verificado
    if (!(await yaProcesado(event.id))) await encolar(event);
    res.sendStatus(200);
  },
);
```

Fuera de Express/Next: `await verifyWebhook({ payload: rawBody, headers, secret })`
de `@mirotaract/sdk` (lanza `MiRotaractWebhookError` con `code`).

## FastAPI

```python
import os
from fastapi import FastAPI, HTTPException, Request
from mirotaract import MiRotaractWebhookError, verify_webhook

@app.post("/api/webhooks/mirotaract")
async def mirotaract_webhook(request: Request):
    try:
        event = verify_webhook(await request.body(), request.headers, os.environ["MIROTARACT_WEBHOOK_SECRET"])
    except MiRotaractWebhookError as error:
        raise HTTPException(400, error.code)
    if not await ya_procesado(event["id"]):
        await encolar(event)          # rápido: el trabajo pesado va en otro proceso
    return {"received": True}
```

## Sin SDK

HMAC-SHA256 con el secreto completo (`whsec_…` como texto) sobre
`"<timestamp>.<cuerpo crudo>"`, en hexadecimal; válido si **alguna** firma
`v1=` coincide en tiempo constante y `|ahora - timestamp| <= 300`:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export function verify(rawBody: string, headers: Headers, secret: string) {
  const timestamp = headers.get("mirotaract-webhook-timestamp");
  const signatures = headers.get("mirotaract-signature");
  if (!timestamp || !signatures) throw new Error("missing_header");
  const seconds = Number(timestamp);
  if (!Number.isInteger(seconds) || Math.abs(Date.now() / 1000 - seconds) > 300) throw new Error("timestamp_out_of_tolerance");
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest();
  const ok = signatures.split(",").map((s) => s.trim()).filter((s) => s.startsWith("v1=")).some((s) => {
    const given = Buffer.from(s.slice(3), "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  if (!ok) throw new Error("invalid_signature");
  return JSON.parse(rawBody);
}
```

```python
import hashlib, hmac, json, time

def verify(raw_body: bytes, headers, secret: str) -> dict:
    timestamp = headers.get("MiRotaract-Webhook-Timestamp")
    signatures = headers.get("MiRotaract-Signature")
    if not timestamp or not signatures:
        raise ValueError("missing_header")
    if abs(time.time() - int(timestamp)) > 300:
        raise ValueError("timestamp_out_of_tolerance")
    expected = hmac.new(secret.encode(), f"{timestamp}.".encode() + raw_body, hashlib.sha256).hexdigest()
    if not any(hmac.compare_digest(s.strip()[3:], expected) for s in signatures.split(",") if s.strip().startswith("v1=")):
        raise ValueError("invalid_signature")
    return json.loads(raw_body)
```

Probá tu implementación con los vectores oficiales
`sdks/conformance/webhook-vectors.json`.

## Logs

Logueá `event.id`, `event.type` y `organizationId`. **No** el cuerpo completo
(trae nombres y, con el scope de contacto, emails y teléfonos), ni la firma,
ni el secreto.

## Probalo en local

```bash
mirotaract webhooks listen --forward-to http://localhost:3000/api/webhooks/mirotaract
# imprime un whsec_ de la sesión: ponelo en MIROTARACT_WEBHOOK_SECRET
```

En producción el endpoint se registra en la consola (pestaña **Webhooks** de
la app) y "Enviar prueba" manda un `ping.v1`. Si el endpoint queda
desactivado por fallas, ponete al día con `updatedSince` (skill
`mirotaract-padron`).
