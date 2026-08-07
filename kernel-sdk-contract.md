# Contrato del Kernel SDK — `@mirotaract/kernel-sdk`

**Versión:** 1.1.0
**Estado:** Contrato de datos derivado de `kernel-spec.md` §12 (más §8, §9.12, §14.3)
**Ámbito:** documentación pura — no contiene implementación. Los shapes se
documentan como contrato (campo, tipo, obligatoriedad), no como código
ejecutable. Ante cualquier conflicto con `kernel-spec.md`, este documento
cede.

---

## 1. Propósito y alcance

El Kernel SDK es la única forma soportada en que un servicio consumidor
(Meetings, Events, Projects, un módulo futuro) lee identidad, membresías,
autoridades y decisiones de autorización del kernel. Ningún consumidor
accede directamente a la base PostgreSQL del kernel (decisión final #2,
§14) ni comparte su esquema Prisma (decisión final #5). Todo el tráfico del
SDK pasa por las rutas `/service/*` (§9.12) autenticadas con identidad de
servicio (§14.3).

El SDK no implementa lógica de negocio del kernel: es un cliente HTTP
tipado con caché local opcional y manejo de reintentos/circuit breaker
(§12.5).

---

## 2. Autenticación servicio-a-servicio

Contrato exigido por `kernel-spec.md` §14.3 para toda llamada del SDK:

| Elemento | Valor / regla |
|---|---|
| Mecanismo | JWT firmado, o mTLS equivalente. |
| `sub` (claim) | Identifica al servicio emisor (p. ej. `meetings-service`). |
| `aud` (claim) | Debe ser exactamente `institutional-kernel`. El kernel rechaza con `401` cualquier token cuya audiencia no coincida. |
| Scopes técnicos | Por endpoint; un servicio sólo puede invocar las operaciones para las que su credencial fue aprovisionada. |
| Rotación de claves | Las claves de firma rotan periódicamente; el SDK debe soportar más de una clave de verificación vigente durante la ventana de rotación. |
| Transporte | El SDK envía el token en `Authorization: Bearer <token>` contra las rutas `/service/*` (§9.12); estas rutas no aceptan tokens de usuario (§9.12 nota final). |
| Rate limiting | Aplicado por servicio emisor, no por usuario final — un consumidor con tráfico alto no debe degradar a otros consumidores. |

El SDK debe fallar rápido (sin reintentar indefinidamente) ante `401`/`403`
de autenticación de servicio: es un error de configuración/aprovisionamiento,
no una condición transitoria.

---

## 3. Métodos del cliente

Todos los métodos son asíncronos y devuelven una promesa que resuelve al
shape documentado o rechaza con uno de los errores de §5. Todos aceptan
opcionalmente un `requestId`/`traceId` de correlación que el SDK propaga
como `X-Correlation-Id` / `traceparent` (§9.1).

| Método | Endpoint HTTP subyacente (§9.12) | Propósito |
|---|---|---|
| `introspect(token)` | `POST /auth/introspect` | Validar un token de usuario recibido por el propio servicio consumidor (p. ej. en su gateway) y obtener su estado. |
| `getUserContext(accountId)` | `GET /service/users/:accountId/context` | Resolver el contexto completo de una cuenta autenticada: persona, rol de plataforma, membresías. |
| `getPerson(personId)` | `GET /service/persons/:personId` | Resumen mínimo de una persona. |
| `getOrganization(organizationId)` | `GET /service/organizations/:organizationId` | Resumen mínimo de una organización. |
| `getMembershipSnapshot(organizationId, options?)` | `GET /service/organizations/:organizationId/membership-snapshot` | Foto de los miembros de una organización, para quórum, listas de asistencia, padrones. |
| `getAuthoritySnapshot(organizationId, options?)` | `GET /service/organizations/:organizationId/authority-snapshot` | Foto de las autoridades vigentes (cargos `ACTIVE`) de una organización. |
| `getPeriodSnapshot(organizationId, options?)` | `GET /service/organizations/:organizationId/period-snapshot` | Foto del período vigente de una organización. |
| `checkAuthorization(request)` | `POST /service/authorization/check` | Decisión de autorización puntual, síncrona. |
| `batchCheckAuthorization(request)` | `POST /service/authorization/batch-check` | Hasta 100 decisiones en una sola llamada (§18). |
| `getModuleInstallation(organizationId, moduleId)` | `GET /service/modules/:moduleId/installations/:organizationId` | Estado de la propia instalación del servicio consumidor en una organización. |

### 3.1 `introspect`

| | |
|---|---|
| **Input** | `token: string` — token de usuario a validar. |
| **Output** | `IntrospectionResult` (§4.6). |
| **Errores** | Ninguno propio: un token inválido/expirado se refleja en `active: false`, no en una excepción. |
| **Caché** | No cacheable — la validación debe ser siempre en vivo. |
| **Idempotency-Key** | No aplica (operación de lectura). |

### 3.2 `getUserContext`

| | |
|---|---|
| **Input** | `accountId: string`. |
| **Output** | `UserContext` (§4.1). |
| **Errores** | `NOT_FOUND` si la cuenta no existe. |
| **Caché** | TTL corto recomendado (≤ 60 s) o invalidación por `kernel.person.account-linked.v1` / cambios de membresía (§ contrato de eventos, catálogo §4.1/§4.3); `UserContext.contextVersion` permite al consumidor detectar una copia obsoleta sin volver a pedir todo el objeto. |
| **Idempotency-Key** | No aplica (lectura). |

### 3.3 `getPerson`

| | |
|---|---|
| **Input** | `personId: string`. |
| **Output** | `PersonSummary` (§4.2). |
| **Errores** | `NOT_FOUND`. |
| **Caché** | TTL medio (p. ej. 5 min); invalidar con `kernel.person.updated.v1` / `kernel.person.archived.v1`. |
| **Idempotency-Key** | No aplica. |

### 3.4 `getOrganization`

| | |
|---|---|
| **Input** | `organizationId: string`. |
| **Output** | `OrganizationSummary` (§4.3). |
| **Errores** | `NOT_FOUND`. |
| **Caché** | TTL medio; invalidar con `kernel.organization.updated.v1` / `.activated.v1` / `.deactivated.v1` / `.moved.v1`. Clave sugerida: `kernel:org-tree:{organizationId}:{version}` (§15.2 de `kernel-spec.md`). |
| **Idempotency-Key** | No aplica. |

### 3.5 `getMembershipSnapshot`

| | |
|---|---|
| **Input** | `organizationId: string`, `options?: { status?: string[]; at?: string }`. |
| **Output** | `MembershipSnapshot` (§4.4). |
| **Errores** | `NOT_FOUND` si la organización no existe. |
| **Caché** | El propio snapshot es inmutable una vez capturado (`snapshotId` + `capturedAt`); un consumidor como Meetings puede **guardarlo** para quórum sin volver a consultar el kernel durante la reunión (§12.3 nota). No confundir con caché con TTL: es una copia sellada de un punto en el tiempo. |
| **Idempotency-Key** | No aplica. |
| **Nota** | `options.at` permite reconstruir el snapshot a una fecha pasada cuando el kernel lo soporta; si se omite, es "ahora". |

### 3.6 `getAuthoritySnapshot`

| | |
|---|---|
| **Input** | `organizationId: string`, `options?: { periodId?: string; at?: string }`. |
| **Output** | `AuthoritySnapshot` (§4.5). |
| **Errores** | `NOT_FOUND`. |
| **Caché** | Igual criterio que `getMembershipSnapshot`: sellar y reutilizar dentro de un flujo (p. ej. una reunión completa), no cachear con TTL implícito. Invalidar activamente ante `kernel.appointment.activated.v1` / `.ended.v1` / `.revoked.v1` si el consumidor mantiene un caché vivo en vez de un snapshot sellado. |
| **Idempotency-Key** | No aplica. |

### 3.7 `getPeriodSnapshot`

| | |
|---|---|
| **Input** | `organizationId: string`, `options?: { at?: string }`. |
| **Output** | `PeriodSnapshot` (§4.7). |
| **Errores** | `NOT_FOUND` sólo si la organización no existe; si existe pero no hay período vigente, devuelve `currentPeriod: null`. |
| **Caché** | TTL corto o invalidación por `kernel.period.activated.v1` / `.closed.v1`. Clave sugerida: `kernel:current-period:{organizationId}:{version}` (§15.2). |
| **Idempotency-Key** | No aplica. |
| **Nota** | Una organización existente sin período activo devuelve `currentPeriod: null`; no se usa `404` para ese caso. |

### 3.8 `checkAuthorization`

| | |
|---|---|
| **Input** | `AuthorizationCheckRequest` (§4.8). |
| **Output** | `AuthorizationDecision` (§4.9). |
| **Errores** | `VALIDATION_ERROR` si `permission` no existe en el catálogo, o `scope` es incoherente (`ORGANIZATION`/`ORGANIZATION_TREE` sin `organizationId` — invariante de esquema §5.1 de `kernel-spec.md`). Nunca lanza por "no autorizado": eso es `allowed: false` en la respuesta, no una excepción. |
| **Caché** | La respuesta incluye `cacheUntil`; el SDK puede cachear la decisión hasta ese instante sin volver a consultar. Debe invalidarse antes si el propio consumidor recibe `kernel.role-assignment.granted/revoked.v1` o `kernel.appointment.activated/revoked.v1` para el mismo `subjectId`+`scope` (CA-AUTHZ-07). |
| **Idempotency-Key** | No aplica (lectura, sin efectos). |
| **Regla de denegación** | Ausencia de una concesión válida implica acceso denegado (principio 9); `DENY` gana sobre `ALLOW` con igual o mayor especificidad (invariante 6.7.4). |

### 3.9 `batchCheckAuthorization`

| | |
|---|---|
| **Input** | `{ checks: AuthorizationCheckRequest[] }`, máximo 100 ítems (§18). |
| **Output** | `AuthorizationDecision[]`, en el mismo orden que `checks` (CA-AUTHZ-06). |
| **Errores** | `VALIDATION_ERROR` si `checks.length > 100`. |
| **Caché** | Igual criterio que `checkAuthorization`, por ítem. |
| **Idempotency-Key** | No aplica. |
| **Uso recomendado** | Preferir sobre N llamadas a `checkAuthorization` siempre que el consumidor necesite evaluar el mismo `subjectId` contra varios permisos/alcances en un mismo request de negocio (p. ej. renderizar un menú con varias acciones condicionadas). |

### 3.10 `getModuleInstallation`

| | |
|---|---|
| **Input** | `organizationId: string`, `moduleId: string`. |
| **Output** | `ModuleInstallationSummary` (§4.10). |
| **Errores** | `NOT_FOUND` si no existe instalación para ese par. |
| **Caché** | TTL medio; invalidar con `kernel.module-activated.v1` / `.suspended.v1` / `.disabled.v1` / `.configuration-updated.v1`. Clave sugerida: `kernel:module:{organizationId}:{moduleId}:{version}` (§15.2). |
| **Idempotency-Key** | No aplica. |
| **Uso recomendado** | Un servicio debe verificar su propia instalación al arrancar y ante cada webhook de cambio de configuración, nunca asumir que está `ACTIVE` de forma indefinida — puede ser suspendida o deshabilitada sin que el servicio pierda sus datos (invariante 6.10.5). |

---

## 4. Shapes de datos

### 4.1 `UserContext`

Fuente: `kernel-spec.md` §12.2.

| Campo | Tipo | Nullable | Significado |
|---|---|---|---|
| `accountId` | string | no | ID de `UserAccount`. |
| `personId` | string | no | ID de la `Person` vinculada. |
| `accountStatus` | `"ACTIVE"` | no | El kernel sólo emite contexto para cuentas activas; una cuenta no `ACTIVE` no produce `UserContext` (falla con `NOT_FOUND` o `FORBIDDEN` según corresponda, no un contexto con otro status). |
| `platformRole` | `"USER" \| "SUPERADMIN"` | no | Rol de plataforma (§5, `PlatformRole`). |
| `displayName` | string | no | Nombre para mostrar. |
| `memberships` | array | no | Lista de resúmenes de membresía (ver abajo). Puede ser `[]`. |
| `memberships[].membershipId` | string | no | |
| `memberships[].organizationId` | string | no | |
| `memberships[].organizationType` | `"DISTRICT" \| "CLUB" \| "OTHER"` | no | |
| `memberships[].status` | string | no | Uno de `MembershipStatus` (§5). |
| `contextVersion` | integer | no | Se incrementa ante cualquier cambio que afecte el contexto (nueva membresía, cambio de rol de plataforma, etc.); usarlo para decidir si una copia cacheada sigue vigente sin comparar campo a campo. |

Regla explícita (§14.2): el access token JWT **no** incluye todas las
membresías o permisos — `UserContext` es la fuente completa para eso, no el
token.

### 4.2 `PersonSummary`

Fuente: inferido de `kernel-spec.md` §12.1 (tipo de retorno de `getPerson`)
y de la regla de minimización de §12.5 ("no almacenar email si sólo
necesitan identidad"). (Supuesto de shape — §12 no lo detalla campo a
campo, sólo el tipo de retorno.)

| Campo | Tipo | Nullable | Significado |
|---|---|---|---|
| `id` | string | no | |
| `firstName` | string | no | |
| `lastName` | string | no | |
| `displayName` | string | sí | |
| `avatarUrl` | string | sí | |

No incluye `primaryEmail`, `phone`, `birthDate` ni `metadata`: un
consumidor que los necesite para un caso concreto debe justificarlo y
solicitar una extensión de contrato versionada (principio 8), no asumir
que están disponibles.

### 4.3 `OrganizationSummary`

(Supuesto de shape — mismo criterio que `PersonSummary`.)

| Campo | Tipo | Nullable | Significado |
|---|---|---|---|
| `id` | string | no | |
| `parentId` | string | sí | |
| `type` | `"DISTRICT" \| "CLUB" \| "OTHER"` | no | |
| `code` | string | no | |
| `name` | string | no | |
| `slug` | string | no | |
| `status` | `"DRAFT" \| "ACTIVE" \| "INACTIVE" \| "ARCHIVED"` | no | |

### 4.4 `MembershipSnapshot`

Fuente: `kernel-spec.md` §12.3.

| Campo | Tipo | Nullable | Significado |
|---|---|---|---|
| `snapshotId` | string | no | Identificador único de esta captura. |
| `organizationId` | string | no | |
| `capturedAt` | string (date-time) | no | Momento de la captura. |
| `sourceVersion` | integer | no | Versión del agregado de membresías del que se derivó, para detectar snapshots obsoletos. |
| `members` | array | no | Puede ser `[]`. |
| `members[].membershipId` | string | no | |
| `members[].personId` | string | no | |
| `members[].accountId` | string | sí | Ausente si la persona no tiene cuenta vinculada. |
| `members[].status` | string | no | Uno de `MembershipStatus`. |

Uso documentado explícitamente: "Meetings puede guardar el snapshot para
quórum sin volver a consultar el kernel" (§12.3) — es decir, es válido
persistirlo como copia de solo lectura ligada a un evento de negocio
puntual (una reunión), no un caché que se refresca en background.

### 4.5 `AuthoritySnapshot`

Fuente: `kernel-spec.md` §12.4.

| Campo | Tipo | Nullable | Significado |
|---|---|---|---|
| `snapshotId` | string | no | |
| `organizationId` | string | no | |
| `periodId` | string | no | |
| `capturedAt` | string (date-time) | no | |
| `appointments` | array | no | Sólo cargos `ACTIVE` en este snapshot (ver `status` abajo). |
| `appointments[].appointmentId` | string | no | |
| `appointments[].positionCode` | string | no | |
| `appointments[].membershipId` | string | no | |
| `appointments[].membershipOrganizationId` | string | no | Organización de la membresía habilitante; permite identificar el club de origen en una autoridad distrital. |
| `appointments[].personId` | string | no | |
| `appointments[].status` | `"ACTIVE"` | no | Fijo — el snapshot no incluye cargos `NOMINATED`/`ELECTED`/`ENDED`/`REVOKED`. |
| `appointments[].startsAt` | string (date-time) | sí | |
| `appointments[].endsAt` | string (date-time) | sí | |

### 4.6 `IntrospectionResult`

(Supuesto de shape — inferido de §9.2 `POST /auth/introspect` y §14.2.)

| Campo | Tipo | Nullable | Significado |
|---|---|---|---|
| `active` | boolean | no | `false` si el token es inválido, expirado o corresponde a una sesión revocada. |
| `accountId` | string | sí | Presente sólo si `active: true`. |
| `personId` | string | sí | |
| `sessionId` | string | sí | |
| `platformRole` | `"USER" \| "SUPERADMIN"` | sí | |
| `expiresAt` | string (date-time) | sí | |

### 4.7 `PeriodSnapshot`

Fuente: `kernel-spec.md` §12.4.1.

| Campo | Tipo | Nullable | Significado |
|---|---|---|---|
| `snapshotId` | string | no | |
| `organizationId` | string | no | |
| `capturedAt` | string (date-time) | no | |
| `currentPeriod` | object | sí | `null` si no hay período `ACTIVE` en el instante consultado. |
| `currentPeriod.periodId` | string | no (si presente) | |
| `currentPeriod.code` | string | no (si presente) | |
| `currentPeriod.name` | string | no (si presente) | |
| `currentPeriod.sequence` | integer | no (si presente) | |
| `currentPeriod.startDate` | string (date) | no (si presente) | |
| `currentPeriod.endDate` | string (date) | no (si presente) | |
| `currentPeriod.status` | `"ACTIVE"` | no (si presente) | |

### 4.8 `AuthorizationCheckRequest`

Fuente: `kernel-spec.md` §9.8 (ejemplo de request).

| Campo | Tipo | Nullable | Significado |
|---|---|---|---|
| `subjectId` | string | no | `personId` a evaluar. |
| `permission` | string | no | Código `<namespace>.<resource>.<action>` (invariante 6.7.1), p. ej. `meetings.meeting.create`. |
| `scope.type` | `"PLATFORM" \| "ORGANIZATION" \| "ORGANIZATION_TREE"` | no | |
| `scope.organizationId` | string | sí (requerido si `scope.type` ≠ `PLATFORM`) | |
| `periodId` | string | sí | Restringe la evaluación a un período institucional puntual. |
| `resource.type` | string | sí | Tipo de recurso de negocio evaluado (definido por el módulo consumidor, no por el kernel). |
| `resource.id` | string | sí | |
| `resource.attributes` | object | sí | |

### 4.9 `AuthorizationDecision`

Fuente: `kernel-spec.md` §9.8 (ejemplo de response).

| Campo | Tipo | Nullable | Significado |
|---|---|---|---|
| `allowed` | boolean | no | |
| `decisionId` | string | no | Identificador de la decisión, para trazabilidad/auditoría. |
| `subjectId` | string | no | Eco de la request. |
| `permission` | string | no | Eco de la request. |
| `matchedAssignments` | string[] | no | IDs de `RoleAssignment` que participaron de la decisión (puede ser `[]` si `allowed: false` por ausencia de concesión). |
| `reasonCodes` | string[] | no | P. ej. `["ROLE_ALLOWED"]`, `["NO_GRANT"]`, `["EXPLICIT_DENY"]` (catálogo exacto pendiente de fijar en la implementación; el consumidor no debe hacer lógica de negocio sobre valores no documentados, sólo loguearlos). |
| `evaluatedAt` | string (date-time) | no | |
| `cacheUntil` | string (date-time) | sí | Instante hasta el cual la decisión es válida para cachear. |

### 4.10 `ModuleInstallationSummary`

(Supuesto de shape — equivalente de lectura para servicios de
`ModuleInstallation`, §5.)

| Campo | Tipo | Nullable | Significado |
|---|---|---|---|
| `installationId` | string | no | |
| `moduleId` | string | no | |
| `organizationId` | string | no | |
| `status` | `"PENDING" \| "ACTIVE" \| "SUSPENDED" \| "DISABLED"` | no | |
| `configuration` | object | sí | Sólo la configuración propia del módulo consultante — nunca la de otro módulo. |
| `activatedAt` | string (date-time) | sí | |
| `disabledAt` | string (date-time) | sí | |

---

## 5. Errores del SDK

Todos los métodos pueden rechazar con uno de estos errores tipados (mapeo
1:1 con Problem Details HTTP, §9.1):

| Código | HTTP subyacente | Cuándo | Reintentable |
|---|---|---|---|
| `NOT_FOUND` | 404 | El recurso solicitado no existe. | No. |
| `VALIDATION_ERROR` | 400/422 | El request no cumple el schema (p. ej. `checks.length > 100`). | No. |
| `UNAUTHENTICATED` | 401 | Credencial de servicio ausente, inválida o expirada. | No — requiere renovar credencial. |
| `FORBIDDEN` | 403 | Credencial de servicio válida pero sin scope para el endpoint. | No — error de aprovisionamiento. |
| `CONFLICT` | 409 | Aplica sólo a operaciones que puedan mutar estado a través de rutas de servicio equivalentes a comandos (si el módulo consumidor las usa). | No sin resolver la causa. |
| `UNAVAILABLE` | 502/503/504 o timeout de red | El kernel no responde o excede el timeout configurado. | Sí, con backoff (ver §6). |

---

## 6. Reglas para consumidores

Trasladadas literalmente desde `kernel-spec.md` §12.5, con la interpretación
operativa que debe seguir cualquier implementación del SDK o de un cliente
manual equivalente:

1. **No almacenar email si sólo se necesita identidad.** Preferir
   `personId`/`accountId` como clave; pedir el email explícitamente sólo
   cuando el caso de uso lo requiere (p. ej. reenviar una notificación).
2. **No asumir que un ID tiene prefijo determinado.** Los ejemplos de este
   documento usan prefijos (`per_`, `org_`, `mem_`) sólo para legibilidad;
   el kernel usa `cuid()` (§5) y no garantiza ni expone ese prefijo como
   parte del contrato. No parsear IDs.
3. **No usar email como FK.** La clave estable entre sistemas es
   `personId`/`accountId`/`organizationId`, nunca el email (que puede
   cambiar, invariante 6.1 normalización).
4. **No replicar credenciales.** El SDK nunca expone `passwordHash`,
   tokens de sesión ni tokens de recuperación; ningún consumidor debe
   almacenar equivalentes propios de estos datos.
5. **No editar snapshots.** `MembershipSnapshot` / `AuthoritySnapshot` /
   `PeriodSnapshot` son de solo lectura; si el consumidor necesita anotar
   algo propio, lo guarda en una estructura separada referenciando
   `snapshotId`, sin mutar el objeto recibido.
6. **Ignorar campos de evento desconocidos.** Ver también el contrato de
   eventos (`kernel-events-contract.md` §6.2) — es la base de la
   compatibilidad hacia adelante.
7. **Procesar eventos idempotentemente.** Ver `kernel-events-contract.md`
   §7.
8. **Aplicar timeout, retry limitado y circuit breaker.** Recomendado:
   timeout ≤ 300 ms para lecturas cacheables (alineado con el objetivo de
   latencia p95 sin caché de autorización, §18), 2-3 reintentos con
   backoff exponencial y jitter sólo para `UNAVAILABLE`, y un circuit
   breaker que abra tras una tasa de error sostenida para no amplificar un
   incidente del kernel hacia los consumidores.
9. **Para operaciones sensibles usar autorización síncrona o snapshot
   sellado.** No decidir una acción irreversible (p. ej. cerrar una
   votación) basándose únicamente en un `UserContext` cacheado; usar
   `checkAuthorization` en el momento de la acción, o un
   `AuthoritySnapshot`/`MembershipSnapshot` capturado explícitamente para
   ese flujo.
