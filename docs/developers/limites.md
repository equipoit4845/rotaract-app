# Límites de uso

Cada app tiene un límite de pedidos **por minuto** y **por día**. Así una
app con un error (un bucle, un reintento sin espera) no deja sin servicio al
resto del distrito.

## Cuánto

| Tu app | Por minuto | Por día |
|---|---|---|
| Aprobada por el distrito | 100 | 20 000 |
| En revisión (nunca aprobada) | 20 | 1 000 |

El RDR puede fijar otros valores para tu app; los ves en la consola (tu app
→ **Límites**) o con `GET /developer/apps/{appId}/quota`. Si necesitás más,
pedíselo al RDR con una estimación de uso.

- Las ventanas son fijas, en **UTC**: el minuto empieza en el segundo 0 y el
  día a las 00:00 UTC (21:00 en Paraguay).
- Cuenta **todo** lo que tu app hace con sus credenciales: `/service/*`,
  `/oauth/token`, `/oauth/revoke` y `/oauth/userinfo` con tokens de tus
  usuarios.
- Además existe el límite por IP del kernel (120 pedidos por minuto, más
  bajo en login y registro), que se aplica antes. Si toda tu app sale de una
  sola IP, ese es el que vas a notar primero.

## Cabeceras

Toda respuesta a un pedido de tu app dice cuánto te queda
(draft-ietf-httpapi-ratelimit-headers):

```http
RateLimit-Policy: "minute";q=100;w=60, "day";q=20000;w=86400
RateLimit: "minute";r=37;t=21, "day";r=19500;t=40210
```

`q` es el límite, `w` la ventana en segundos, `r` lo que queda y `t` los
segundos hasta que se renueva.

## Cuando te pasás: 429

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 21
Content-Type: application/problem+json

{ "status": 429, "code": "KERNEL_RATE_LIMITED",
  "detail": "La app superó su límite de 100 pedidos por minuto. Probá de nuevo en 21 s.",
  "traceId": "4bf92f3577b34da6a3ce929d0e0e4736", ... }
```

Esperá lo que dice `Retry-After` (segundos) antes de reintentar. Un 429
**nunca** procesó el pedido: el kernel cuenta antes de hacer nada, así que
reintentar es seguro incluso en `/oauth/token` (no se consumió el código ni
se rotó el refresh token).

## Con los SDKs oficiales

Los SDKs ya lo hacen: reintentan hasta 2 veces los pedidos que se pueden
repetir (lecturas, y `POST` con `Idempotency-Key`; el pedido del token solo
ante 429), esperando lo que dice `Retry-After` si no supera el tope (30 s
por defecto). Si igual no alcanza, lanzan un error tipado:

```ts
import { MiRotaractRateLimitError } from "@mirotaract/sdk";

try {
  await client.members.list(clubId).all();
} catch (error) {
  if (error instanceof MiRotaractRateLimitError) {
    console.warn(`Cuota agotada; reintentar en ${error.retryAfter} s`, error.rateLimit);
  } else throw error;
}
```

```python
from mirotaract import MiRotaractRateLimitError

try:
    client.members.list(club_id).all()
except MiRotaractRateLimitError as error:
    print(f"Cuota agotada; reintentar en {error.retry_after} s", error.rate_limit)
```

Opciones: `maxRetries` / `max_retries` y `maxRetryDelayMs` /
`max_retry_delay` (segundos en Python). `MiRotaractRateLimitError` es una
`MiRotaractApiError`, así que el código que ya atrapaba esa sigue andando.

## Buenas prácticas

- Usá la sincronización incremental (`updatedSince`) y `ETag` en vez de
  bajar todo el padrón cada vez ([api-de-datos.md](api-de-datos.md)).
- Preferí [webhooks](webhooks.md) a consultar cada pocos segundos.
- Cacheá el token de servicio (vale 10 minutos; los SDKs lo hacen).
- Si hacés trabajos por lotes, repartilos en el tiempo y mirá `RateLimit`.
