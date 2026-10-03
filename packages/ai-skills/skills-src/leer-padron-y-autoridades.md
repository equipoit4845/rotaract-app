---
name: mirotaract-padron
title: Leer padrón, autoridades y períodos (API de datos)
description: >-
  Lee el padrón de socios, las autoridades vigentes, los períodos y las
  organizaciones de Mi Rotaract con la API de datos /service/* y un token de
  servicio (client_credentials), con paginación por cursor, ETag/304 y
  sincronización incremental. Usala cuando pidan mostrar o sincronizar socios,
  el padrón del club, la lista de miembros, autoridades, presidencias, cargos
  o clubes del distrito.
globs:
  - "**/*.{ts,tsx,js,mjs,py}"
---

## Cómo funciona

- Solo apps `CONFIDENTIAL` y **solo en el servidor**: la app canjea
  `client_id` + secreto por un **token de servicio** (`POST /oauth/token`,
  `grant_type=client_credentials`, vale 10 minutos, `aud =
  institutional-kernel`) y lo usa contra `/service/*`. El SDK lo pide, lo cachea
  y lo renueva solo.
- El token ve **toda** la organización de la app (un club, o el distrito y
  sus clubes). **Quién de tus usuarios puede ver qué lo decide tu app**: por
  ejemplo, solo socios `ACTIVE`/`ON_LEAVE` del club ven su padrón, consultando
  sus membresías en el momento (`persons.memberships(sub)`), no lo que diga una
  sesión de hace horas.
- El access token de una persona (login) **no sirve** para `/service/*`.

## Scopes mínimos por endpoint

| Qué | Endpoint | Scope |
|---|---|---|
| Organizaciones | `GET /service/organizations`, `GET /service/organizations/{id}` | `kernel.service.organizations.read` |
| Padrón | `GET /service/organizations/{id}/members` | `kernel.service.memberships.read` |
| Membresías de una persona | `GET /service/persons/{id}/memberships` | `kernel.service.memberships.read` |
| Personas | `GET /service/persons/{id}`, `POST /service/persons/batch` | `kernel.service.persons.read` |
| Autoridades vigentes | `GET /service/organizations/{id}/authorities` | `kernel.service.authorities.read` |
| Períodos | `GET /service/organizations/{id}/periods` | `kernel.service.periods.read` |
| Email, teléfono, nacimiento | (agrega campos a personas y socios) | `kernel.service.persons.contact.read` — **solo** si la app tiene que contactar personas |

Pedí en el token solo los scopes que usa ese proceso (`scope` del cliente).
Sin el scope de contacto, `email`/`phone`/`birthDate` **no existen** en el JSON
(no vienen en `null`). Las autoridades nunca traen datos de contacto.

## TypeScript (`@mirotaract/sdk`, solo servidor)

```ts
import "server-only";
import { MiRotaract } from "@mirotaract/sdk";

export const mr = new MiRotaract({
  baseUrl: process.env.MIROTARACT_BASE_URL!,           // = issuer
  clientId: process.env.MIROTARACT_CLIENT_ID!,
  clientSecret: process.env.MIROTARACT_CLIENT_SECRET!,  // solo env del servidor
  scope: ["kernel.service.memberships.read"],           // lo mínimo para este proceso
});

// Padrón: el paginador sigue nextCursor solo
for await (const socio of mr.members.list(clubId, { status: "ACTIVE", limit: 100 })) {
  render(socio.person.displayName, socio.memberNumber);
}
const todos = await mr.members.list(clubId, { limit: 100 }).all({ max: 2000 }); // corta en max

// Autoridades vigentes (presidencias de todos los clubes, pedido sobre el distrito)
const autoridades = await mr.authorities.list(districtId, { includeDescendants: true });
const presidencias = autoridades.filter((a) => a.positionCode === "CLUB_PRESIDENT"); // lógica por positionCode, mostrar positionName

// Período vigente
const [vigente] = await mr.periods.list(clubId, { status: "ACTIVE" });

// Varias personas (parte de a 100, deduplica, omite las fuera de alcance)
const personas = await mr.persons.batch(ids);
```

## Python (`mirotaract`)

```python
import os
from mirotaract import MiRotaract  # AsyncMiRotaract dentro de rutas async

mr = MiRotaract(
    os.environ["MIROTARACT_BASE_URL"],
    os.environ["MIROTARACT_CLIENT_ID"],
    os.environ["MIROTARACT_CLIENT_SECRET"],
    scope=["kernel.service.memberships.read", "kernel.service.authorities.read"],
)

for socio in mr.members.list(club_id, status="ACTIVE", limit=100):   # todas las páginas
    print(socio["membershipId"])                                      # ids, no datos personales, en logs
autoridades = mr.authorities.list(club_id, include_descendants=False)
periodos = mr.periods.list(club_id, status="ACTIVE")
```

## ETag y `304` (refrescos periódicos)

```ts
const first = await mr.members.list(clubId).page();
if (!first.notModified) guardar(first.items, first.etag);
// después
const again = await mr.members.list(clubId, { ifNoneMatch: etagGuardado }).page();
if (again.notModified) return; // nada cambió: no hay cuerpo
```

```python
again = mr.members.list(club_id, if_none_match=etag_guardado).page()
if again.not_modified:
    return
```

`ifNoneMatch` solo aplica a la primera página. Si hay más (`hasMore`), seguí
con `.page(cursor)` o combiná con `updatedSince`.

## Sincronización incremental

Si guardás una copia (es solo una caché):

1. Primera vez: recorré todo.
2. Guardá el **mayor `updatedAt` recibido** (no la hora de tu servidor).
3. Después: `members.list(clubId, { updatedSince })` y aplicá cambios por id.
4. **No filtres por `status`** al sincronizar: las bajas llegan como cambio de
   `status` (`INACTIVE`, `GRADUATED`, `TRANSFERRED`), las membresías no se
   borran. Mejor aún: combiná con webhooks (skill `mirotaract-webhooks`).

## Sin SDK (HTTP)

```ts
async function* allMembers(token: string, organizationId: string) {
  let cursor: string | undefined;
  do {
    const url = new URL(`${API}/service/organizations/${organizationId}/members`);
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`); // sin volcar el cuerpo ni el token
    const page = await res.json();
    yield* page.items;
    cursor = page.pageInfo.hasMore ? page.pageInfo.nextCursor : undefined;
  } while (cursor);
}
```

Cacheá el token de servicio (no pidas uno por llamada) y renovalo antes de
`expires_in`.

## Errores

- `403` "Fuera del alcance de esta app": la organización o persona no está en
  el árbol de la app. No reintentes.
- `401`: token vencido o app pausada; el SDK reintenta una vez con token nuevo.
- `429` / `503`: respetá `Retry-After` (el SDK reintenta). No reintentes en
  bucle otros `4xx`.
- A la persona mostrale un mensaje genérico con el `traceId`, nunca detalles
  internos ni el cuerpo del error.

## Probalo

`mirotaract dev up` → distrito sintético con 6 clubes y 60 personas ficticias.
Con el MCP: `describe_operation serviceListMembers` (parámetros, scope y
ejemplos), `list_permissions` (scopes de servicio).
