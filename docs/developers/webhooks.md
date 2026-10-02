# Webhooks: que Mi Rotaract le avise a tu app

En vez de preguntarle al kernel cada tanto "¿hubo socios nuevos?", tu app
puede **recibir un aviso** apenas pasa algo: un socio activado, una baja, una
persona que asume la presidencia, un club archivado. Eso es un **webhook**:
Mi Rotaract hace un `POST` a una dirección de tu servidor con los datos del
evento, firmado para que puedas comprobar que viene de nosotros.

| | |
|---|---|
| Qué eventos hay | [catalogo-de-eventos.md](catalogo-de-eventos.md) y `GET /api/kernel/v1/events/catalog` |
| Dónde se configura | Consola de apps → tu app → pestaña **Webhooks** |
| Quién lo configura | Quien administra la app (el RDR o quien tenga el permiso) |
| Requisito | Un servidor con `https` accesible desde internet |

## 1. Registrar tu endpoint

En la consola (`https://app.rotaract4845.com/developer/apps`), entrá a tu app,
pestaña **Webhooks**, **Agregar endpoint**:

1. **Dirección**: la URL de tu servidor que va a recibir los avisos, por
   ejemplo `https://asistencia.miclub.org/api/webhooks/mirotaract`. Tiene que
   ser `https` y un dominio público (no se aceptan `localhost`, IP privadas
   ni nombres internos).
2. **Qué avisos querés recibir**: marcá los tipos. Solo aparecen habilitados
   los que tu app tiene permiso de leer (por ejemplo, para "Socio activado"
   la app necesita el permiso *Leer el padrón de socios*).
3. Al guardar, la consola te muestra el **secreto de firma** (`whsec_…`)
   **una sola vez**. Copialo a las variables de entorno de tu servidor, por
   ejemplo `MIROTARACT_WEBHOOK_SECRET`.

Después usá **Enviar prueba**: te llega un evento `ping.v1` y en la lista de
envíos ves si tu servidor respondió bien.

> Solo recibís eventos de las organizaciones del alcance de tu app: si la app
> es de un club, solo de ese club; si es del distrito, del distrito y sus
> clubes. Los datos de contacto (email, teléfono, fecha de nacimiento) solo
> vienen si la app tiene el permiso de contacto, igual que en la
> [API de datos](api-de-datos.md).

## 2. Qué te llega

```http
POST /api/webhooks/mirotaract HTTP/1.1
Content-Type: application/json
User-Agent: MiRotaract-Webhooks/1
MiRotaract-Webhook-Id: evt_cm1q2w3e4r5t6y7u8i9o0p
MiRotaract-Webhook-Timestamp: 1790985600
MiRotaract-Signature: v1=5f1c…e9a2

{
  "id": "evt_cm1q2w3e4r5t6y7u8i9o0p",
  "type": "membership.activated.v1",
  "createdAt": "2026-10-02T21:15:04.000Z",
  "organizationId": "cm1clubsanlorenzo0000000",
  "data": {
    "membership": {
      "membershipId": "cm1…",
      "organizationId": "cm1clubsanlorenzo0000000",
      "personId": "cm1…",
      "status": "ACTIVE",
      "joinedAt": "2026-10-02T21:15:04.000Z",
      "memberNumber": "1042",
      "person": { "id": "cm1…", "displayName": "Ana Pérez", "firstName": "Ana", "lastName": "Pérez", "avatarUrl": null, "updatedAt": "…" },
      "updatedAt": "…"
    },
    "previousStatus": "PENDING"
  }
}
```

| Cabecera | Qué es |
|---|---|
| `MiRotaract-Webhook-Id` | Identificador del evento. **Es el mismo en cada reintento**: usalo para no procesar dos veces lo mismo. Igual al `id` del cuerpo. |
| `MiRotaract-Webhook-Timestamp` | Momento del envío, en segundos Unix. |
| `MiRotaract-Signature` | `v1=` + la firma en hexadecimal. Durante un cambio de secreto vienen dos, separadas por coma. |

`data` tiene la misma forma que la API de datos (`MemberView`,
`AuthorityView`, `OrganizationView`, `PersonView`, `PeriodView`). El detalle
de cada tipo está en el [catálogo](catalogo-de-eventos.md).

## 3. Verificar la firma (obligatorio)

Cualquiera puede mandarle un `POST` a tu servidor. La firma es lo que te
asegura que el aviso viene de Mi Rotaract y que nadie lo modificó. **Nunca
proceses un webhook sin verificarlo.**

Lo más importante: verificá el **cuerpo crudo**, tal cual llegó. Si tu
framework ya lo convirtió en objeto (por ejemplo `express.json()`) y lo
volvés a serializar, los bytes cambian y la firma no coincide.

### JavaScript / TypeScript (`@mirotaract/sdk`)

Una línea, en cualquier runtime con Web Crypto (Node 20+, edge):

```ts
import { verifyWebhook } from "@mirotaract/sdk";

const event = await verifyWebhook({
  payload: rawBody, // string o Buffer, el cuerpo crudo
  headers: req.headers,
  secret: process.env.MIROTARACT_WEBHOOK_SECRET!,
}); // lanza MiRotaractWebhookError si no es válido
```

**Next.js (App Router)** — `app/api/webhooks/mirotaract/route.ts`:

```ts
import { createWebhookHandler } from "@mirotaract/sdk/next";

export const POST = createWebhookHandler({
  secret: process.env.MIROTARACT_WEBHOOK_SECRET!,
  async onEvent(event) {
    if (await yaProcesado(event.id)) return; // idempotencia
    switch (event.type) {
      case "membership.activated.v1":
        await darDeAltaEnLaApp(event.data.membership);
        break;
      case "membership.ended.v1":
        await darDeBaja(event.data.membership.personId, event.data.reason);
        break;
    }
    await marcarProcesado(event.id);
  },
});
```

Responde 200 si todo salió bien, 400 si la firma no es válida y 500 si
`onEvent` lanza un error (entonces Mi Rotaract reintenta).

**Express**:

```ts
import express from "express";
import { miRotaractWebhook } from "@mirotaract/sdk/express";

app.post(
  "/api/webhooks/mirotaract",
  express.raw({ type: "application/json" }), // cuerpo crudo en esta ruta
  miRotaractWebhook({ secret: process.env.MIROTARACT_WEBHOOK_SECRET! }),
  async (req, res) => {
    await encolar(req.miRotaractEvent); // ya verificado
    res.sendStatus(200);
  },
);
```

### Python (`mirotaract`)

```python
import os
from mirotaract import verify_webhook, MiRotaractWebhookError

event = verify_webhook(raw_body, headers, os.environ["MIROTARACT_WEBHOOK_SECRET"])
```

**FastAPI**:

```python
import os

from fastapi import FastAPI, HTTPException, Request
from mirotaract import MiRotaractWebhookError, verify_webhook

app = FastAPI()

@app.post("/api/webhooks/mirotaract")
async def mirotaract_webhook(request: Request):
    try:
        event = verify_webhook(
            await request.body(),  # bytes crudos
            request.headers,
            os.environ["MIROTARACT_WEBHOOK_SECRET"],
        )
    except MiRotaractWebhookError as error:
        raise HTTPException(400, error.code)
    if not ya_procesado(event["id"]):
        encolar(event)
    return {"received": True}
```

En Flask: `verify_webhook(request.get_data(), request.headers, secreto)`.

### Errores de verificación

| `code` | Qué pasó |
|---|---|
| `missing_header` | Faltan `MiRotaract-Signature` o `MiRotaract-Webhook-Timestamp`. |
| `invalid_timestamp` | La marca de tiempo no es un número. |
| `timestamp_out_of_tolerance` | Más de 5 minutos de diferencia con tu reloj (posible reenvío de un mensaje viejo). Revisá que tu servidor tenga la hora bien (NTP). |
| `invalid_signature` | La firma no coincide: secreto equivocado o cuerpo modificado/re-serializado. |
| `invalid_payload` | Firma correcta pero el cuerpo no es un evento (o pasaste un objeto ya parseado). |

### Sin SDK

La firma es `HMAC-SHA256` con el secreto completo (`whsec_…`, como texto
UTF-8) como clave, sobre `"<timestamp>.<cuerpo crudo>"`, en hexadecimal:

```js
const expected = crypto
  .createHmac("sha256", secret)
  .update(`${timestamp}.${rawBody}`)
  .digest("hex");
// válido si alguno de los "v1=..." de MiRotaract-Signature es igual
// (comparación de tiempo constante) y |ahora - timestamp| <= 300
```

Los casos de prueba oficiales están en
[`sdks/conformance/webhook-vectors.json`](../../sdks/conformance/webhook-vectors.json):
si tu implementación los pasa todos, verifica igual que los SDKs.

## 4. Responder rápido

- Respondé con cualquier código **2xx** dentro de **10 segundos**. Cualquier
  otra cosa (3xx, 4xx, 5xx, timeout, conexión rechazada) cuenta como falla.
- No seguimos redirecciones: si tu URL redirige, cambiala por la final.
- Si lo que tenés que hacer tarda (mandar emails, recalcular algo), guardá el
  evento en una cola y respondé enseguida.

## 5. Reintentos

Si tu servidor falla, volvemos a intentar con esperas crecientes:
1 minuto, 5 minutos, 30 minutos, 2 horas, 6 horas, 12 horas y después cada 12
horas, **durante 72 horas** desde el evento. Pasado ese plazo el envío queda
como "No se pudo entregar".

- Cada reintento lleva **el mismo `id` y el mismo cuerpo**, con una marca de
  tiempo y una firma nuevas.
- Desde la consola podés **reenviar** cualquier envío (también uno que ya se
  entregó): es un intento más, en el momento.
- Si **todos** los envíos a un endpoint fallan durante 72 horas seguidas, lo
  **desactivamos** y la consola lo marca "Desactivado por fallas". Los
  eventos de mientras no se guardan: cuando lo arregles, reactivalo y ponete
  al día con la [API de datos](api-de-datos.md) usando `updatedSince`.

## 6. Idempotencia y orden

- **Puede llegarte el mismo evento más de una vez** (por ejemplo, si tu
  servidor lo procesó pero tardó más de 10 s en responder, o si alguien lo
  reenvía desde la consola). Guardá los `id` que ya procesaste y salteá los
  repetidos.
- **El orden no está garantizado**: un reintento puede llegar después de un
  evento más nuevo. Usá `createdAt` y, ante la duda, consultá el estado
  actual con la API de datos (por ejemplo `members.list` con `updatedSince`).
- Ignorá los campos que no conozcas: podemos agregar campos opcionales a un
  tipo sin cambiarle la versión. Un cambio incompatible sería un tipo nuevo
  (`.v2`).

## 7. Cambiar el secreto

En la consola, **Crear secreto nuevo**: te mostramos el secreto nuevo una vez
y durante **24 horas** cada aviso lleva dos firmas (la nueva y la anterior).
Actualizá tu servidor en ese plazo; mientras tanto el secreto viejo sigue
verificando. Los SDKs también aceptan una lista de secretos
(`secret: [nuevo, viejo]`) si preferís hacer el cambio en dos pasos.

## 8. Probar en tu computadora

Tu `localhost` no es accesible desde internet, así que el kernel de
producción no puede mandarle avisos. Dos opciones:

- **Kernel local** (`mirotaract dev`, ver la CLI): permite
  `http://localhost:…` porque corre con `KERNEL_WEBHOOKS_ALLOW_INSECURE=true`.
- **`mirotaract webhooks listen --forward-to http://localhost:3000/api/webhooks/mirotaract`**:
  la CLI se conecta al stream de eventos de tu app (con el `client_id` y el
  secreto de la app) y reenvía cada evento a tu servidor local con las mismas
  cabeceras. Al conectarse imprime un secreto `whsec_…` propio de esa sesión:
  usalo como `MIROTARACT_WEBHOOK_SECRET` mientras desarrollás. El stream solo
  está habilitado en kernels locales y de prueba.

## 9. Checklist

- [ ] Verifico la firma de **cada** aviso, con el cuerpo crudo.
- [ ] El secreto está en variables de entorno, no en el código ni en el repo.
- [ ] Respondo 2xx en menos de 10 s y dejo el trabajo pesado para después.
- [ ] Deduplico por `MiRotaract-Webhook-Id`.
- [ ] No dependo del orden de llegada.
- [ ] Mi servidor tiene la hora sincronizada (NTP).
- [ ] Si el endpoint se desactiva, sé cómo ponerme al día con `updatedSince`.
