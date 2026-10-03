# 18 · Gobierno y protección de datos (E11)

Épica E11 del plan _Mi Rotaract Developers_: "Abrir los datos del distrito a
terceros exige reglas claras sobre quién accede, para qué y con qué
trazabilidad". Este documento fija las reglas; lo que lee un equipo de
desarrollo está en [developers/revision-de-apps.md](developers/revision-de-apps.md)
y [developers/limites.md](developers/limites.md).

| Historia | Dónde |
|---|---|
| E11.1 El RDR revisa cada app antes de producción con una lista de control | `application/governance/review-policy.ts`, `app-review.service.ts`; `POST /developer/apps/{appId}/review`; consola **Revisión de apps** |
| E11.2 Cada socio ve qué apps acceden a sus datos y retira el acceso | `access-history.writer.ts`, `access-history.service.ts`; `GET /me/app-access`; **Apps conectadas** |
| E11.3 El distrito limita el uso por app; los SDKs respetan 429 y `Retry-After` | `app-quota.ts`, `app-quota.service.ts`; `GET/PUT /developer/apps/{appId}/quota`; SDKs `MiRotaractRateLimitError` |
| E11.4 Catálogo de apps del distrito en el panel de los socios | `audience.ts`, `app-catalog.service.ts`; `PUT /developer/apps/{appId}/listing`, `GET /me/apps`; **Apps del distrito**, tarjetas **Aplicaciones** |

Contrato: tag `Governance` de `kernel-openapi.yaml` (más los campos nuevos
de `DeveloperApp` y la respuesta `RateLimited` en `/service/*`,
`/oauth/token`, `/oauth/revoke` y `/oauth/userinfo`). Migración
`20261005100000_governance_e11`. Permiso nuevo `kernel.app.review`
("Revisar, aprobar y publicar apps"), otorgado a `DISTRICT_RDR` por la
migración y por el seed.

## Quién hace qué

| Acción | Permiso | Dónde se evalúa |
|---|---|---|
| Ver la cola de revisión, aprobar, rechazar | `kernel.app.review` | La organización de la app (cola: la organización consultada y sus descendientes) |
| Fijar los límites de una app | `kernel.app.review` | La organización de la app |
| Publicar una app en el panel y elegir a quién | `kernel.app.review` | La organización de la app (catálogo: la organización consultada) |
| Cargar propósito, política, contacto y cuentas de prueba; pedir revisión de nuevo | `kernel.app.manage` | La organización de la app |
| Ver la revisión y los límites de su app | `kernel.app.read` | La organización de la app |
| Ver el historial propio, quitar un acceso, ver las apps publicadas para mí | sesión | Siempre la persona de la sesión: no hay parámetro de persona |

Hoy el RDR registra **y** aprueba las apps (es el único con
`kernel.app.manage` y `kernel.app.review`). La aprobación queda registrada
con quién la hizo y la lista de control marcada; si el distrito quiere
separar funciones, alcanza con dar `kernel.app.manage` a otro cargo.

## Revisión de apps (E11.1)

### Estados

`reviewStatus`: `IN_REVIEW` → `APPROVED` | `REJECTED`; `REJECTED` →
`IN_REVIEW` (el equipo corrige y pide revisión de nuevo, `POST
/developer/apps/{appId}/review-request`). Es independiente de `status`
(`ACTIVE`/`SUSPENDED`/`REVOKED`): una app aprobada se puede pausar y una app
en revisión puede estar activa (para probarla).

- **Toda app nueva empieza en `IN_REVIEW`** (default de la columna), con una
  entrada `SUBMITTED` en su historial.
- **Las apps que existían al aplicar la migración quedaron `APPROVED`** con
  sus scopes actuales (`approvedScopes = scopes`) y una entrada
  `AUTO_APPROVED`. Así las apps de Reuniones que ya están en producción
  siguen igual.
- `approvedScopes` son los datos aprobados. **Solo esos sirven para
  cualquier persona.** `approvedAt` marca que la app ya pasó a producción
  alguna vez.
- Si una app aprobada pide un dato nuevo (`PATCH scopes`), la revisión se
  **reabre** (`IN_REVIEW`, entrada `REOPENED`) pero lo ya aprobado sigue
  funcionando para todos; lo nuevo queda "en revisión". Si quita un dato,
  deja de estar aprobado, sin revisión. Si vuelve a quedar sin nada
  pendiente, vuelve a `APPROVED` sola.

### Lista de control

`ReviewChecklist`: `purpose` (el propósito está claro y es del distrito),
`data` (los datos pedidos son los necesarios), `owner` (hay un responsable
identificado: `ownerPersonId`, la persona que registró la app), `privacyPolicy`
(tiene política de privacidad publicada) y `contact` (tiene un contacto que
responde).

- **Aprobar** exige los cinco puntos marcados **y** que la app tenga
  cargados `purpose`, `privacyPolicyUrl` (https) y `contactEmail`. Copia
  `scopes` a `approvedScopes`.
- **Rechazar** exige un motivo de 10 a 1000 caracteres; el equipo lo ve en
  su consola. La app conserva lo que ya tenía aprobado, si tenía algo.
- Revisar una app que no está `IN_REVIEW`: 409.

Cada decisión queda en `DeveloperAppReview` (tipo, lista de control, motivo,
quién, scopes del momento) y en `KernelAuditLog`
(`approveDeveloperApp`, `rejectDeveloperApp`, `requestDeveloperAppReview`).

### Mientras está en revisión (qué se limita)

Lo que no está en `approvedScopes`:

| Uso | Comportamiento |
|---|---|
| "Ingresar con Mi Rotaract" | Solo el responsable de la app y sus **cuentas de prueba** (`testAccountEmails`, hasta 20 correos, se comparan sin mayúsculas). Cualquier otra persona ve en la pantalla de autorización: "Esta app todavía está en revisión del distrito: por ahora solo pueden ingresar su responsable y las cuentas de prueba." El refresh también se corta si la persona deja de ser cuenta de prueba (`invalid_grant`). |
| Token de servicio (`client_credentials`) | Solo los scopes **sin datos personales**: `kernel.service.organizations.read`, `kernel.service.periods.read`, `kernel.service.modules.read`. Pedir explícitamente otro scope no aprobado: `invalid_scope` ("Pending the district's review"). Si no queda ninguno: `invalid_scope`. |
| Webhooks | Los eventos se filtran con los mismos scopes efectivos: no llegan eventos con datos personales hasta la aprobación. El `ping` de prueba sí. |
| Límites | Más bajos mientras la app no se aprobó nunca (ver Cuotas). |
| Catálogo del panel | No se puede publicar. |

Para probar con datos reales de forma segura, el equipo usa el kernel local
(`mirotaract dev`, distrito sintético 9999) o el sandbox de E12.

## Historial de accesos (E11.2)

`PersonAppAccess`: una fila por persona + app + tipo de acceso, con
`details` (qué **tipo** de dato, nunca el dato). Sin claves foráneas (se
escribe en lotes y vence sola).

| `kind` | Cuándo | `details` |
|---|---|---|
| `CONSENT_GRANTED` | La persona aprueba datos nuevos en la pantalla de consentimiento | Los scopes nuevos |
| `SIGN_IN` | Canje del código (`authorization_code`) | Scopes del código |
| `TOKEN_REFRESH` | `refresh_token` | Scopes |
| `USERINFO` | `GET /oauth/userinfo` | Scopes del token |
| `DATA_READ` | Lecturas de `/service/*` atribuibles a una persona: `persons/{personId}`, `persons/{personId}/memberships`, `persons/batch` (cada persona devuelta), `users/{accountId}/context` | `person` (+ `contact` si el token tiene el scope de contacto), `person-memberships`, `account-context` |
| `CONSENT_REVOKED` | La persona quita el acceso | — |

No se atribuyen persona por persona los listados de un club entero
(`members`, `authorities`, snapshots): serían decenas de filas por página;
quedan en los registros de la app (E9). Tampoco los chequeos de permisos.

**Cómo se escribe.** `AccessHistoryWriter` encola en memoria y escribe con
`createMany` cada segundo o cada 200 filas, sin tocar la base en el camino
del request; buffer acotado (10 000) y un lote que falla se descarta con un
aviso (como `RequestLogWriter`). `TOKEN_REFRESH`, `USERINFO` y `DATA_READ`
repetidos de la misma persona, app y datos se agrupan en una fila cada 15
minutos (una app que refresca cada 10 minutos no llena el año).

**Retención:** 365 días (`KERNEL_ACCESS_HISTORY_RETENTION_DAYS`); el job de
retención corre cada hora donde corren los jobs (`KERNEL_JOBS_ENABLED`).

**Lectura:** `GET /me/app-access` (apps conectadas o que leyeron datos de la
persona en el período, con cantidad y último acceso) y `GET
/me/app-access/{appId}` (eventos, paginados, con una frase en español). Las
dos usan solo la persona de la sesión; el cursor tiene que ser una fila de
esa persona. Una persona nunca ve el historial de otra.

**Quitar el acceso:** `DELETE /oauth/consents/{appId}` (ya existía): revoca
el consentimiento y todos los refresh tokens de esa persona con esa app; los
access tokens dejan de servir en `userinfo` en el siguiente pedido. Ahora
además deja una fila `CONSENT_REVOKED` y una entrada `revokeOAuthConsent` en
la auditoría. Las apps que leen datos con su propio token de servicio (las
del club o del distrito) no tienen un consentimiento que la persona pueda
quitar: la pantalla lo explica y la deriva a su club o al distrito.

## Cuotas (E11.3)

Límites por app, **por minuto y por día** (ventanas fijas en UTC), por
`client_id`, contados en Redis (`kernel:app-quota:<clientId>:m:<minuto>` y
`:d:<día>`; si Redis no responde, cada réplica cuenta en memoria).

Cuentan todos los pedidos autenticados como la app: `/service/*` (token de
servicio), `/oauth/userinfo` (token de una persona emitido a la app),
`/oauth/token` y `/oauth/revoke` (credenciales de la app, después de
autenticarla). Se cuentan **antes** de hacer cualquier otra cosa, así un 429
nunca consumió un código ni rotó un refresh token. Un pedido rechazado por
el minuto no descuenta del día.

| Variable | Default | Qué |
|---|---|---|
| `KERNEL_APP_QUOTAS_ENABLED` | `true` | `false` apaga las cuotas |
| `KERNEL_APP_QUOTA_PER_MINUTE` / `_PER_DAY` | 100 / 20 000 | Apps aprobadas |
| `KERNEL_APP_REVIEW_QUOTA_PER_MINUTE` / `_PER_DAY` | 20 / 1 000 | Apps que nunca se aprobaron |

El RDR fija valores propios por app (`PUT /developer/apps/{appId}/quota`,
`null` vuelve al default; queda en la auditoría como
`updateDeveloperAppQuota`). `GET .../quota` devuelve límites, uso y de dónde
salen (`default`, `review`, `custom`).

**Respuestas.** Toda respuesta a un pedido de la app trae
`RateLimit-Policy: "minute";q=100;w=60, "day";q=20000;w=86400` y
`RateLimit: "minute";r=37;t=21, "day";r=19500;t=40210`
(draft-ietf-httpapi-ratelimit-headers, campos estructurados). Pasado el
límite: **429** Problem Details con `code: KERNEL_RATE_LIMITED`, el motivo
en español y `Retry-After` en segundos (lo que falta para que se renueve la
ventana agotada).

**El límite por IP sigue** (120 por minuto en general, `KernelThrottlerGuard`)
y se aplica antes. Con los defaults, un servidor que hace todo desde una IP
llega antes al de IP que al de la app; subir la cuota de una app por encima
de 120/min sirve solo si sus pedidos salen de varias IPs.

**SDKs.** Reintentan pedidos idempotentes (GET/PUT/DELETE, o POST con
`Idempotency-Key`) ante 429/502/503/504 respetando `Retry-After`, hasta 2
veces, si la espera no supera el tope (`maxRetryDelayMs` / `max_retry_delay`,
30 s). El pedido del token reintenta **solo** ante 429. Después, lanzan
`MiRotaractRateLimitError` (subclase de `MiRotaractApiError`) con
`retryAfter` / `retry_after`, `rateLimitPolicy` / `rate_limit_policy` y
`rateLimit` / `rate_limit`.

## Catálogo de apps del distrito (E11.4)

El RDR publica apps aprobadas para que aparezcan en el panel de Mi Rotaract
de quien corresponda. Primer caso: las presidencias abren Reuniones
(`https://reuniones.rotaract4845.com`) desde su inicio.

`DeveloperAppListing` (una por app): `published`, `displayName` (2–60),
`shortDescription` (≤ 160), `icon` (nombre de ícono de lucide en kebab-case,
como `calendar-days`, o URL https de una imagen; la web dibuja un conjunto acotado de íconos, `features/governance/components/app-icon.tsx`, y uno genérico para nombres que no conoce), `launchUrl` (https; http
solo para localhost), `audiences`, `positionCodes`, `displayOrder` (0–1000,
menor primero).

- **Solo se publica una app `APPROVED` y `ACTIVE`** (409 si no). Pausar o
  revocar la app la despublica en la misma transacción
  (`unpublishDeveloperApp` en la auditoría); reactivarla no la vuelve a
  publicar sola.
- **Sugerencia.** Mientras no se guardó nada, `GET /developer/app-catalog`
  devuelve una sugerencia: nombre y descripción de la app, y si la app tiene
  un módulo de E8, su `ui.navLabel`, `ui.icon` y `ui.entryUrl`; si no, el
  origen de la primera dirección de regreso como enlace.
- **Público** (unión de los elegidos), evaluado contra las membresías y los
  nombramientos **ACTIVE** de la persona dentro del árbol de la organización
  de la app:

| `audience` | Quién la ve |
|---|---|
| `DISTRICT_MEMBERS` | Toda persona con una membresía o un cargo activo en el árbol |
| `CLUB_PRESIDENTS` | Cargo activo `CLUB_PRESIDENT` en un club |
| `CLUB_AUTHORITIES` | Cualquier cargo activo de un club |
| `DISTRICT_AUTHORITIES` | Cualquier cargo activo del distrito |
| `POSITIONS` | Un cargo activo cuyo código está en `positionCodes` |

- **Módulos (E8).** Si la app tiene un módulo instalado pero **no activo**
  en un club, las membresías y cargos de ese club no cuentan (sus socios no
  la ven). Si el módulo no está instalado en un club, no cambia nada.
- `GET /me/apps` devuelve solo `appId`, `name`, `description`, `icon` y
  `launchUrl` de las apps visibles para la persona.
- Auditoría: `publishDeveloperApp`, `unpublishDeveloperApp`,
  `updateDeveloperAppListing`.

**Reuniones para presidencias y autoridades del distrito** (lo que hará el
equipo después del despliegue):

```json
PUT /developer/apps/{appId}/listing
{ "published": true, "displayName": "Reuniones",
  "shortDescription": "Convocatorias, actas y asistencia de las reuniones distritales",
  "icon": "calendar-days", "launchUrl": "https://reuniones.rotaract4845.com",
  "audiences": ["CLUB_PRESIDENTS", "DISTRICT_AUTHORITIES"], "displayOrder": 10 }
```

**Abrir una app** es un enlace en una pestaña nueva. La app hace su propio
"Ingresar con Mi Rotaract"; como la persona ya tiene sesión en Mi Rotaract,
es un clic más el consentimiento la primera vez. **No hay atajo de
consentimiento**: una opción futura sería marcar algunas apps como "app
oficial del distrito" para saltear el consentimiento de los datos básicos;
hoy no existe.

## Web (apps/mirotaract-web)

- **Revisión de apps** (`/developer/reviews`, ítem en el grupo Distrito con
  `kernel.app.review`): cola por estado; detalle con los datos de la lista de
  control, los cinco puntos para marcar, aprobar o rechazar con motivo, e
  historial.
- **Consola de la app** (`/developer/apps/[appId]`): estado de la revisión y
  qué se limita mientras tanto, el motivo de un rechazo y "Pedir revisión de
  nuevo", los datos de la lista de control y las cuentas de prueba; pestaña
  **Límites** con el uso del minuto y del día (y, para el RDR, los límites
  propios).
- **Apps conectadas** (`/connected-apps`): cada app con lo que puede ver, el
  historial de accesos y **Quitar acceso**; las apps del club o del distrito
  explican que no se pueden quitar desde ahí.
- **Apps del distrito** (`/developer/catalog`, con `kernel.app.review`):
  apps aprobadas, "Mostrar a los socios", edición y vista previa de cómo la
  ve una presidencia y cómo un socio.
- **Inicio**: tarjetas **Aplicaciones** con las apps de `GET /me/apps`;
  ítem **Aplicaciones** en el menú cuando hay al menos una.

## Pruebas

| Qué | Dónde |
|---|---|
| Reglas de revisión, scopes efectivos, cuentas de prueba, reapertura, lista de control | `review-policy.spec.ts`, `client-credentials.grant.spec.ts`, `oidc.service.spec.ts` |
| Ventanas, cabeceras, 429, Redis caído | `app-quota.spec.ts` |
| Escritura del historial, agrupación, buffer | `access-history.spec.ts` |
| Público, módulos, íconos, enlaces, sugerencia | `audience.spec.ts` |
| E2E (stack real): app nueva limitada → aprobación → acceso completo; rechazo y nuevo pedido; reapertura; historial propio y ajeno; quitar acceso corta el refresh; 429 con `Retry-After`; el SDK reintenta y lanza el error tipado; publicar para presidencias, ocultar al pausar; respuestas validadas contra el contrato | `test/governance.e2e-spec.ts` |
| SDKs | `packages/sdk-js/src/http.test.ts`, `sdks/python/tests/test_http.py`; conformidad `review.limited_until_approved` y `quota.retry_after_then_typed_error` |
| Web | `apps/mirotaract-web/test/runtime/governance.runtime.test.ts` |
