# API de datos

Referencia de los endpoints `/service/*` que una app de servidor puede usar
con su token de servicio (ver
[autenticacion-servidor.md](autenticacion-servidor.md)). El contrato completo
está en `kernel-openapi.yaml`, tag `Service`.

```text
API = https://api.rotaract4845.com/api/kernel/v1
Authorization: Bearer <token de servicio>
```

> **Estado.** Los endpoints marcados **v1** forman la API de datos v1 y se
> están implementando ahora sobre el contrato publicado. Los marcados
> **disponible** ya funcionan hoy.

## Reglas comunes

### Alcance

Todo se limita a la organización de tu app y sus descendientes:

- Si la ruta trae un `organizationId` fuera del alcance → `403` "Fuera del
  alcance de esta app".
- Si trae un `personId` → la persona tiene que tener alguna membresía en una
  organización de tu alcance; si no, `403`.
- Los listados se filtran solos: nunca devuelven organizaciones ajenas.
- `POST /service/persons/batch` omite en silencio a las personas fuera del
  alcance.

### Proyecciones

Cada endpoint devuelve una vista con campos definidos en el contrato
(`OrganizationView`, `PersonView`, `MemberView`, etc.), nunca la fila
interna de la base. Escribí tu código para que ignore campos que no conoce:
así una versión compatible que agregue un campo no te rompe nada.

### Datos de contacto

`email`, `phone` y `birthDate` de una persona **solo aparecen** si tu token
tiene `kernel.service.persons.contact.read`. Sin ese scope, las propiedades
**no están** en el JSON (no vienen en `null`: no existen). Con el scope,
pueden venir en `null` si la persona no tiene ese dato cargado.

Las autoridades (`AuthorityView`) nunca incluyen datos de contacto.

### Paginación por cursor

Los listados paginados reciben `limit` (1 a 100, 25 por defecto) y `cursor`,
y responden:

```json
{
  "items": [ ... ],
  "pageInfo": { "nextCursor": "eyJ1IjoiMjAyNi0wOS0yOFQxNDowMjoxMVoiLCJpIjoiY21iMyJ9", "hasMore": true }
}
```

El cursor es **opaco**: no lo armes ni lo interpretes, solo pasalo tal cual
en el siguiente pedido. El orden es estable (`updatedAt`, `id`), así que no
se pierden ni se repiten elementos entre páginas.

```ts
async function* allMembers(token: string, organizationId: string) {
  let cursor: string | undefined;
  do {
    const url = new URL(`${API}/service/organizations/${organizationId}/members`);
    url.searchParams.set("limit", "100");
    url.searchParams.set("status", "ACTIVE");
    if (cursor) url.searchParams.set("cursor", cursor);

    const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const page = await response.json();
    yield* page.items;
    cursor = page.pageInfo.hasMore ? page.pageInfo.nextCursor : undefined;
  } while (cursor);
}
```

```python
def all_members(token: str, organization_id: str):
    params = {"limit": 100, "status": "ACTIVE"}
    while True:
        response = httpx.get(
            f"{API}/service/organizations/{organization_id}/members",
            params=params,
            headers={"Authorization": f"Bearer {token}"},
        )
        response.raise_for_status()
        page = response.json()
        yield from page["items"]
        if not page["pageInfo"]["hasMore"]:
            break
        params["cursor"] = page["pageInfo"]["nextCursor"]
```

Los SDKs oficiales (en publicación) hacen esto solos con iteradores.

### Sincronización incremental (`updatedSince`)

Si mantenés una copia local (por ejemplo, la lista de asistentes de tu app),
no la bajes entera cada vez:

1. La primera vez, recorré el listado completo.
2. Guardá el **mayor `updatedAt` que recibiste** (no la hora de tu
   servidor: los relojes difieren).
3. Las siguientes veces pedí `?updatedSince=<ese valor>` y aplicá los cambios
   por `id` (insertar o actualizar).

```bash
curl -s -G "$API/service/organizations/$CLUB_ID/members" \
  -H "Authorization: Bearer $TOKEN" \
  --data-urlencode "updatedSince=2026-09-28T14:02:11.000Z"
```

Las membresías no se borran: una baja llega como un cambio de `status`
(`INACTIVE`, `GRADUATED`, `TRANSFERRED`). Si filtrás por `status=ACTIVE` en
la sincronización incremental no te vas a enterar de las bajas; no filtres
por estado al sincronizar.

Recordá que tu copia es **solo una caché**: la fuente de verdad sigue siendo
el kernel. No la uses para "corregir" datos.

### ETag y `304 Not Modified`

Los listados de organizaciones y de socios devuelven un encabezado `ETag`
(débil, un hash del contenido). Si lo reenviás en `If-None-Match` y nada
cambió, la respuesta es `304` sin cuerpo:

```bash
curl -s -i "$API/service/organizations/$CLUB_ID/members" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'If-None-Match: W/"5f2b9c1e"'
# HTTP/1.1 304 Not Modified
```

Ideal para refrescos periódicos: casi no consume ancho de banda.

## Organizaciones

### Listar organizaciones · v1

`GET /service/organizations` · scope `kernel.service.organizations.read`

| Parámetro | Tipo | Descripción |
|---|---|---|
| `type` | `DISTRICT` \| `CLUB` \| `OTHER` | Filtra por tipo. |
| `status` | `DRAFT` \| `ACTIVE` \| `INACTIVE` \| `ARCHIVED` | Filtra por estado. |
| `parentId` | string | Solo hijas de esa organización. |
| `updatedSince` | fecha ISO 8601 | Solo lo modificado desde ese instante. |
| `cursor`, `limit` | | Paginación. |
| `If-None-Match` (header) | | ETag de una respuesta anterior. |

Respuestas: `200` (`OrganizationViewPage`, con `ETag`), `304`.

```bash
curl -s "$API/service/organizations?type=CLUB&status=ACTIVE&limit=2" \
  -H "Authorization: Bearer $TOKEN"
```

```json
{
  "items": [
    {
      "id": "cmb0c1asucentro000000001",
      "type": "CLUB",
      "code": "RAC-ASU-CENTRO",
      "name": "Club Rotaract Asunción Centro",
      "slug": "asuncion-centro",
      "status": "ACTIVE",
      "parentId": "cmb0d4845000000000000001",
      "countryCode": "PY",
      "region": "Capital",
      "city": "Asunción",
      "timezone": "America/Asuncion",
      "logoUrl": null,
      "description": "Club fundado por jóvenes del centro histórico de Asunción.",
      "updatedAt": "2026-08-14T13:20:05.000Z"
    },
    {
      "id": "cmb0c2encsur00000000002",
      "type": "CLUB",
      "code": "RAC-ENC-SUR",
      "name": "Club Rotaract Encarnación Sur",
      "slug": "encarnacion-sur",
      "status": "ACTIVE",
      "parentId": "cmb0d4845000000000000001",
      "countryCode": "PY",
      "region": "Itapúa",
      "city": "Encarnación",
      "timezone": "America/Asuncion",
      "logoUrl": null,
      "description": null,
      "updatedAt": "2026-09-02T18:45:00.000Z"
    }
  ],
  "pageInfo": { "nextCursor": "eyJ1IjoiMjAyNi0wOS0wMlQxODo0NTowMFoiLCJpIjoiY21iMGMyIn0", "hasMore": true }
}
```

Una app de club recibe solo su club.

### Ver una organización · disponible

`GET /service/organizations/{organizationId}` · scope
`kernel.service.organizations.read`

Respuestas: `200` (`OrganizationView`, mismos campos que en el listado),
`403` fuera de alcance. Hasta que salga v1 este endpoint puede devolver más
campos que los de `OrganizationView`; no dependas de ellos.

## Socios

### Padrón de una organización · v1

`GET /service/organizations/{organizationId}/members` · scope
`kernel.service.memberships.read` (+ `kernel.service.persons.contact.read`
para datos de contacto)

| Parámetro | Tipo | Descripción |
|---|---|---|
| `status` | `PENDING` \| `ACTIVE` \| `ON_LEAVE` \| `INACTIVE` \| `GRADUATED` \| `TRANSFERRED` | Filtra por estado de membresía. |
| `updatedSince` | fecha ISO 8601 | Solo lo modificado desde ese instante. |
| `cursor`, `limit` | | Paginación. |
| `If-None-Match` (header) | | ETag de una respuesta anterior. |

Respuestas: `200` (`MemberViewPage`, con `ETag`), `304`, `403`.

Sin scope de contacto:

```json
{
  "items": [
    {
      "membershipId": "cmb3m0asu0000000000000a1",
      "organizationId": "cmb0c1asucentro000000001",
      "personId": "cmb1p0lucia0000000000001",
      "status": "ACTIVE",
      "joinedAt": "2024-03-09T00:00:00.000Z",
      "memberNumber": "ASU-0042",
      "person": {
        "id": "cmb1p0lucia0000000000001",
        "displayName": "Lucía Benítez",
        "firstName": "Lucía",
        "lastName": "Benítez",
        "avatarUrl": null,
        "updatedAt": "2026-07-03T11:10:00.000Z"
      },
      "updatedAt": "2026-07-03T11:10:00.000Z"
    }
  ],
  "pageInfo": { "nextCursor": null, "hasMore": false }
}
```

Con `kernel.service.persons.contact.read`, `person` agrega:

```json
{
  "id": "cmb1p0lucia0000000000001",
  "displayName": "Lucía Benítez",
  "firstName": "Lucía",
  "lastName": "Benítez",
  "avatarUrl": null,
  "email": "lucia.benitez@example.com",
  "phone": "+595 981 000 000",
  "birthDate": "2001-05-17",
  "updatedAt": "2026-07-03T11:10:00.000Z"
}
```

### Membresías de una persona · v1

`GET /service/persons/{personId}/memberships` · scope
`kernel.service.memberships.read`

Devuelve las membresías de la persona **dentro del alcance de tu app**. Respuestas: `200` (lista de `PersonMembershipView`),
`403`.

```json
[
  {
    "membershipId": "cmb3m0asu0000000000000a1",
    "organizationId": "cmb0c1asucentro000000001",
    "organizationName": "Club Rotaract Asunción Centro",
    "organizationType": "CLUB",
    "status": "ACTIVE",
    "joinedAt": "2024-03-09T00:00:00.000Z",
    "endedAt": null
  }
]
```

### Snapshot de membresías · disponible

`GET /service/organizations/{organizationId}/membership-snapshot` · scope
`kernel.service.memberships.read`

Una foto sellada (con `snapshotId` y `capturedAt`) de las membresías, pensada
para quórum o listas que tienen que quedar fijas. Parámetros: `status`
(repetible) y `at` (fecha ISO 8601). Respuesta `MembershipSnapshot`:
`{ snapshotId, organizationId, capturedAt, sourceVersion, members: [{ membershipId, personId, accountId, status }] }`.

## Personas

### Ver una persona · disponible

`GET /service/persons/{personId}` · scope `kernel.service.persons.read`

Respuestas: `200` (`PersonView`), `403` si la persona no tiene membresías en
tu alcance. Hasta que salga v1 este endpoint puede devolver más campos que
los de `PersonView`; no dependas de ellos.

### Varias personas por id · v1

`POST /service/persons/batch` · scope `kernel.service.persons.read`

Cuerpo: `{ "ids": [...] }`, entre 1 y 100 ids. Las personas fuera de tu
alcance (o inexistentes) **se omiten** de la respuesta; no hacen fallar el
pedido. Compará los ids que pediste con los que volvieron.

```bash
curl -s -X POST "$API/service/persons/batch" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "ids": ["cmb1p0lucia0000000000001", "cmb1p0matias000000000002"] }'
```

```json
[
  {
    "id": "cmb1p0lucia0000000000001",
    "displayName": "Lucía Benítez",
    "firstName": "Lucía",
    "lastName": "Benítez",
    "avatarUrl": null,
    "updatedAt": "2026-07-03T11:10:00.000Z"
  },
  {
    "id": "cmb1p0matias000000000002",
    "displayName": "Matías Ortiz",
    "firstName": "Matías",
    "lastName": "Ortiz",
    "avatarUrl": "https://cdn.rotaract4845.com/avatars/cmb1p0matias000000000002.webp",
    "updatedAt": "2026-09-11T22:31:40.000Z"
  }
]
```

Es una consulta (no modifica nada), aunque use `POST`.

## Autoridades

### Autoridades vigentes · v1

`GET /service/organizations/{organizationId}/authorities` · scope
`kernel.service.authorities.read`

Nombramientos `ACTIVE` de la organización. Con `includeDescendants=true`
incluye los de las organizaciones hijas (por ejemplo, las presidencias de
todos los clubes, pedido sobre el distrito). Respuestas: `200` (lista de
`AuthorityView`), `403`.

```bash
curl -s "$API/service/organizations/$DISTRICT_ID/authorities?includeDescendants=true" \
  -H "Authorization: Bearer $TOKEN"
```

```json
[
  {
    "appointmentId": "cmb4a0asupres00000000001",
    "organizationId": "cmb0c1asucentro000000001",
    "periodId": "cmb2per2627asucentro0001",
    "positionCode": "CLUB_PRESIDENT",
    "positionName": "Presidencia",
    "status": "ACTIVE",
    "startsAt": "2026-07-01T00:00:00.000Z",
    "endsAt": "2027-06-30T00:00:00.000Z",
    "person": {
      "id": "cmb1p0matias000000000002",
      "displayName": "Matías Ortiz",
      "avatarUrl": null
    }
  },
  {
    "appointmentId": "cmb4a0asusecr00000000002",
    "organizationId": "cmb0c1asucentro000000001",
    "periodId": "cmb2per2627asucentro0001",
    "positionCode": "CLUB_SECRETARY",
    "positionName": "Secretaría",
    "status": "ACTIVE",
    "startsAt": "2026-07-01T00:00:00.000Z",
    "endsAt": null,
    "person": {
      "id": "cmb1p0lucia0000000000001",
      "displayName": "Lucía Benítez",
      "avatarUrl": null
    }
  }
]
```

Las autoridades nunca traen datos de contacto, aunque tengas el scope.

### Snapshot de autoridades · disponible

`GET /service/organizations/{organizationId}/authority-snapshot` · scope
`kernel.service.authorities.read`

Parámetros: `periodId`, `at`. Respuesta `AuthoritySnapshot` con
`appointments: [{ appointmentId, positionCode, membershipId, membershipOrganizationId, personId, status, startsAt, endsAt }]`.

## Períodos

### Períodos de una organización · v1

`GET /service/organizations/{organizationId}/periods` · scope
`kernel.service.periods.read`

Parámetro opcional `status` (`DRAFT`, `SCHEDULED`, `ACTIVE`, `CLOSED`,
`CANCELLED`). Respuestas: `200` (lista de `PeriodView`), `403`.

```json
[
  {
    "id": "cmb2per2627asucentro0001",
    "organizationId": "cmb0c1asucentro000000001",
    "code": "2026-2027",
    "name": "Período 2026-2027",
    "status": "ACTIVE",
    "startDate": "2026-07-01T00:00:00.000Z",
    "endDate": "2027-06-30T00:00:00.000Z"
  }
]
```

### Snapshot del período vigente · disponible

`GET /service/organizations/{organizationId}/period-snapshot` · scope
`kernel.service.periods.read`

Parámetro `at`. Respuesta `PeriodSnapshot`:
`{ snapshotId, organizationId, capturedAt, currentPeriod }`, con
`currentPeriod` en `null` si no hay período activo.

## Consultar un permiso

### Una decisión · disponible

`POST /service/authorization/check` · scope
`kernel.service.authorization.check`

¿Puede esta persona hacer esto en esta organización? El `organizationId` del
`scope` es **obligatorio** para una app y tiene que estar en su alcance (una
pregunta sin organización es "de toda la plataforma" y queda fuera de
cualquier app).

```bash
curl -s -X POST "$API/service/authorization/check" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "subjectId": "cmb1p0lucia0000000000001",
    "permission": "kernel.membership.read",
    "scope": { "type": "ORGANIZATION", "organizationId": "cmb0c1asucentro000000001" }
  }'
```

```json
{
  "allowed": true,
  "decisionId": "dec_7f3a9b2c",
  "subjectId": "cmb1p0lucia0000000000001",
  "permission": "kernel.membership.read",
  "matchedAssignments": ["cmb5r0asusecr00000000001"],
  "reasonCodes": ["ROLE_ALLOWED"],
  "evaluatedAt": "2026-10-02T15:04:05.000Z",
  "cacheUntil": "2026-10-02T15:09:05.000Z"
}
```

Podés cachear la decisión hasta `cacheUntil`.

### Varias decisiones · disponible

`POST /service/authorization/batch-check` · mismo scope. Cuerpo
`{ "checks": [ ... ] }` con hasta 100 pedidos como el anterior; cada uno
tiene que tener una organización dentro del alcance. Responde una lista de
decisiones en el mismo orden.

## Otros endpoints de servicio

Existen para servicios de la plataforma; una app de comité rara vez los
necesita:

| Endpoint | Scope | Devuelve |
|---|---|---|
| `GET /service/users/{accountId}/context` | `kernel.service.users.read` | `UserContext` de una cuenta (la persona tiene que estar en tu alcance). |
| `GET /service/modules/{moduleId}/installations/{organizationId}` | `kernel.service.modules.read` | `ModuleInstallation`, o `404`. |
| `POST /auth/introspect` | `kernel.service.tokens.introspect` | Estado de un token de sesión de la plataforma. |

## Resumen de scopes por endpoint

| Endpoint | Scope |
|---|---|
| `GET /service/organizations` | `kernel.service.organizations.read` |
| `GET /service/organizations/{organizationId}` | `kernel.service.organizations.read` |
| `GET /service/organizations/{organizationId}/members` | `kernel.service.memberships.read` |
| `GET /service/organizations/{organizationId}/membership-snapshot` | `kernel.service.memberships.read` |
| `GET /service/persons/{personId}/memberships` | `kernel.service.memberships.read` |
| `GET /service/persons/{personId}` | `kernel.service.persons.read` |
| `POST /service/persons/batch` | `kernel.service.persons.read` |
| `GET /service/organizations/{organizationId}/authorities` | `kernel.service.authorities.read` |
| `GET /service/organizations/{organizationId}/authority-snapshot` | `kernel.service.authorities.read` |
| `GET /service/organizations/{organizationId}/periods` | `kernel.service.periods.read` |
| `GET /service/organizations/{organizationId}/period-snapshot` | `kernel.service.periods.read` |
| `POST /service/authorization/check` | `kernel.service.authorization.check` |
| `POST /service/authorization/batch-check` | `kernel.service.authorization.check` |
| `GET /service/users/{accountId}/context` | `kernel.service.users.read` |
| `GET /service/modules/{moduleId}/installations/{organizationId}` | `kernel.service.modules.read` |
| `POST /auth/introspect` | `kernel.service.tokens.introspect` |

Datos de contacto en personas y socios: además,
`kernel.service.persons.contact.read`.
