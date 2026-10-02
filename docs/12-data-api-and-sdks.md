# 12 · API de datos institucionales v1 (E4) y SDKs oficiales (E5)

Continúa [11-developer-platform-auth.md](11-developer-platform-auth.md). Toda
llamada de esta API usa un token de servicio (`client_credentials`, E2) y queda
limitada a la organización de la app y sus descendientes
(`request.service.allowedOrganizationIds`; `undefined` = sin restricción, solo
el bypass de desarrollo).

## E4 · API de datos v1

### Reglas comunes

- **Proyecciones explícitas.** Ningún endpoint devuelve filas de Prisma. Cada
  vista tiene su schema en el contrato y su función de mapeo.
- **Paginación por cursor** en colecciones: `?limit` (1–100, 25 por
  defecto) y `?cursor` opaco. Respuesta
  `{ items, pageInfo: { nextCursor, hasMore } }`. El orden es estable
  (`updatedAt`, `id`).
- **Sincronización incremental:** `?updatedSince=<ISO 8601>` devuelve solo lo
  modificado desde ese instante.
- **ETag** débil en todas las lecturas GET (hash del contenido). Con
  `If-None-Match` igual → `304` sin cuerpo.
- **Datos de contacto** (`email`, `phone`, `birthDate`) solo con el scope
  nuevo `kernel.service.persons.contact.read`; sin él, esos campos no
  aparecen (no van en `null`: se omiten).
- **Alcance:** un `organizationId` fuera del alcance → 403. Los listados se
  filtran por el alcance, nunca devuelven organizaciones ajenas.

### Endpoints nuevos

| Operación | Ruta | Scope |
|---|---|---|
| `serviceListOrganizations` | `GET /service/organizations?type&status&parentId&updatedSince&cursor&limit` | `kernel.service.organizations.read` |
| `serviceListMembers` | `GET /service/organizations/{organizationId}/members?status&updatedSince&cursor&limit` | `kernel.service.memberships.read` (+ contacto con el scope de contacto) |
| `serviceListAuthorities` | `GET /service/organizations/{organizationId}/authorities?includeDescendants` | `kernel.service.authorities.read` |
| `serviceListPeriods` | `GET /service/organizations/{organizationId}/periods?status` | `kernel.service.periods.read` |
| `serviceBatchPersons` | `POST /service/persons/batch` `{ ids: string[] }` (máx. 100) | `kernel.service.persons.read` |
| `servicePersonMemberships` | `GET /service/persons/{personId}/memberships` | `kernel.service.memberships.read` |

Y se corrigen `serviceGetPerson` y `serviceGetOrganization`, que hoy devuelven
la fila cruda, para que devuelvan `PersonView` y `OrganizationView`.

### Vistas

- `OrganizationView`: `id, type, code, name, slug, status, parentId, countryCode, region, city, timezone, logoUrl, description, updatedAt`.
- `PersonView`: `id, displayName, firstName, lastName, avatarUrl, updatedAt` (+ `email, phone, birthDate` con scope de contacto).
- `MemberView`: `membershipId, organizationId, personId, status, joinedAt, memberNumber, person: PersonView, updatedAt`.
- `AuthorityView`: `appointmentId, organizationId, periodId, positionCode, positionName, status, startsAt, endsAt, person: { id, displayName, avatarUrl }` (sin contacto).
- `PersonMembershipView`: `membershipId, organizationId, organizationName, organizationType, status, joinedAt, endedAt`.
- `PeriodView`: `id, organizationId, code, name, status, startDate, endDate`.

## E5 · SDKs oficiales

### Superficie común (igual en todos los lenguajes)

```
client = MiRotaract({ baseUrl, clientId, clientSecret })   # servidor
client.clubs.list({ status })            -> iterador paginado
client.clubs.get(id)
client.members.list(organizationId, { status, updatedSince })
client.persons.get(id) / client.persons.batch(ids)
client.authorities.list(organizationId, { includeDescendants })
client.periods.list(organizationId)
client.permissions.check({ personId, permission, organizationId })

auth = MiRotaractAuth({ issuer, clientId, clientSecret?, redirectUri })
auth.authorizationUrl({ scope, state?, nonce? }) -> { url, codeVerifier, state, nonce }
auth.exchangeCode({ code, codeVerifier })        -> tokens + claims verificados
auth.refresh(refreshToken)
auth.verifyIdToken(idToken, { nonce })           -> claims (JWKS remoto, cacheado)
auth.userInfo(accessToken)
```

- El token de servicio se pide y se renueva solo (caché hasta 60 s antes del
  vencimiento).
- Errores tipados: `MiRotaractApiError` (Problem Details: `status`, `code`,
  `title`, `detail`, `traceId`) y `MiRotaractOAuthError` (`error`,
  `error_description`).
- Reintentos con backoff ante 429/502/503/504 respetando `Retry-After`; nunca
  reintenta un POST sin `Idempotency-Key`.
- Paginación: iteradores que siguen `nextCursor` de forma transparente.
- Discovery: `issuer` alcanza; el resto se lee de
  `/.well-known/openid-configuration`.

### Paquetes de esta entrega

| Paquete | Ubicación | Incluye |
|---|---|---|
| `@mirotaract/sdk` | `packages/sdk-js` | Núcleo isomórfico (fetch), `auth`, recursos, adaptador Express (`requireMiRotaractUser`) y helpers de Next.js (route handlers de login/callback/logout con cookie cifrada) |
| `mirotaract` (Python ≥ 3.10) | `sdks/python` | Cliente síncrono y asíncrono sobre `httpx`, `auth` con PKCE y verificación por JWKS (`PyJWT[crypto]`), dependencia para FastAPI |

Flutter, PHP, Kotlin, Swift, .NET y Go quedan para la segunda ola.

### Suite de conformidad

`sdks/conformance/scenarios.json` describe escenarios independientes del
lenguaje (alta de token, listado paginado, 403 fuera de alcance, ETag 304,
flujo OIDC completo con PKCE, refresh, verificación de `id_token`; desde E7,
también la firma de webhooks con los vectores de
`sdks/conformance/webhook-vectors.json` y el catálogo de eventos). Cada SDK
tiene un runner que los ejecuta contra un kernel real descartable. Un SDK no
se publica si su runner falla.
