# 13 · Eventos y webhooks firmados (E7)

Continúa [12-data-api-and-sdks.md](12-data-api-and-sdks.md). Objetivo de la
épica: *que una app se entere de altas, bajas y cambios de cargo sin
consultar al kernel periódicamente.*

- **E7.1** La app se suscribe a eventos y los recibe firmados (HMAC con marca
  de tiempo); el SDK los verifica en una línea. Solo eventos de las
  organizaciones de su alcance.
- **E7.2** No pierde eventos si su servidor se cae: reintentos con backoff
  durante 72 h y reenvío manual desde la consola.
- **E7.3** Catálogo de eventos con ejemplos, generado de una sola fuente,
  versionado por tipo (`.v1`).

Guía para desarrolladores: [developers/webhooks.md](developers/webhooks.md).
Catálogo: [developers/catalogo-de-eventos.md](developers/catalogo-de-eventos.md).

## Arquitectura

```text
comando (API)                    worker (KERNEL_JOBS_ENABLED=true)
─────────────                    ─────────────────────────────────────────────
tx: cambio + OutboxMessage ──►   1. fan-out  OutboxMessage (webhooksFannedOutAt IS NULL)
                                    FOR UPDATE SKIP LOCKED
                                    planPublicEvent → resolvePublicEvent → renderForApp
                                    ──► WebhookDelivery (1 por endpoint interesado)
                                 2. entrega  WebhookDelivery PENDING vencidas
                                    lease (lockedUntil) con FOR UPDATE SKIP LOCKED
                                    firma HMAC → POST (10 s, guardia SSRF)
                                    ok → SUCCEEDED · falla → backoff o FAILED
```

- El outbox (`OutboxMessage`) es la única fuente de eventos. La publicación a
  NATS (`status`) y el fan-out a webhooks (`webhooksFannedOutAt`) son
  independientes: uno no bloquea al otro.
- **Nada de esto corre en el proceso de la API.** `WebhookDispatcherService`
  arranca su intervalo (`KERNEL_WEBHOOKS_DISPATCH_INTERVAL_MS`, 5 s por
  defecto) solo donde corren los jobs: en `docker-compose.yml` el contenedor
  `api` tiene `KERNEL_JOBS_ENABLED=false` y el `worker` `true`. La API solo
  escribe filas (crear endpoint, encolar una prueba o un reenvío).
- La migración `20261003120000_webhooks` marca todo el outbox existente como
  ya repartido: los webhooks empiezan desde el despliegue, sin reenviar la
  historia.

### Varios workers

- Fan-out: `SELECT … FOR UPDATE SKIP LOCKED` sobre el outbox dentro de una
  transacción que crea las entregas y marca las filas. Además
  `@@unique([endpointId, eventId])` + `createMany(skipDuplicates)`: un fan-out
  repetido no duplica.
- Entrega: `UPDATE … SET lockedUntil = now()+60 s WHERE id IN (SELECT … FOR
  UPDATE SKIP LOCKED)`. El lease (60 s) supera el presupuesto HTTP (10 s); si
  un worker muere a mitad de un envío, otro lo retoma al vencer el lease.
- Garantía: **al menos una vez**. Un receptor puede ver el mismo evento más de
  una vez (reintento después de un timeout en el que sí procesó, reenvío
  manual): deduplica por `MiRotaract-Webhook-Id`.

## Modelo de datos

| Modelo | Campos clave |
|---|---|
| `WebhookEndpoint` | `appId`, `url`, `eventTypes[]`, `status` (`ENABLED`/`DISABLED`), `disabledReason` (`MANUAL`/`AUTO_FAILURES`), `secretEnc` + `secretHint`, `previousSecretEnc` + `previousSecretExpiresAt`, `failingSince`, `consecutiveFailures`, `lastSuccessAt`, `lastFailureAt` |
| `WebhookDelivery` | `endpointId`, `eventId` (`evt_…`), `eventType`, `outboxMessageId`, `organizationId`, `payload` (el cuerpo exacto que se firma), `status` (`PENDING`/`SUCCEEDED`/`FAILED`), `attempts`, `nextAttemptAt`, `retryUntil`, `lockedUntil`, `firstAttemptAt`, `lastAttemptAt`, `lastResponseStatus`, `lastResponseBody` (1 KB), `lastLatencyMs`, `lastError`, `deliveredAt` |
| `OutboxMessage` | nuevo `webhooksFannedOutAt` |

Los endpoints y sus entregas se borran en cascada con la app. El cuerpo se
guarda ya renderizado para la app: cada reintento y cada reenvío manda los
mismos bytes (misma firma posible, mismo `id`).

### Secretos

`whsec_` + 32 bytes aleatorios en base64url. El kernel necesita el texto
plano para calcular cada HMAC, así que no puede guardar un hash como con los
secretos de las apps: se guarda cifrado con AES-256-GCM, con una clave
derivada de `KERNEL_SIGNING_KEY_SECRET` y una etiqueta propia
(`secret-box.ts`), igual que las claves privadas ES256 de `SigningKeyService`.
Un volcado de la base no alcanza para firmar webhooks. Si
`KERNEL_SIGNING_KEY_SECRET` cambia, los secretos existentes no se pueden
descifrar: el envío falla con "No se pudo firmar el envío" y hay que rotarlos.

El secreto se muestra **una sola vez** (al crear y al rotar). Igual que con
las apps, un `Idempotency-Key` repetido no lo vuelve a entregar (409). Al
rotar, el anterior sigue firmando 24 h: el encabezado lleva dos `v1=`.

## Firma (contrato HTTP)

```http
POST <url del endpoint>
Content-Type: application/json
User-Agent: MiRotaract-Webhooks/1
MiRotaract-Webhook-Id: evt_cm1…
MiRotaract-Webhook-Timestamp: 1790985600
MiRotaract-Signature: v1=<hex>[,v1=<hex del secreto anterior>]

{"id":"evt_cm1…","type":"membership.activated.v1","createdAt":"…","organizationId":"…","data":{…}}
```

- `v1 = hex(HMAC-SHA256(clave = secreto completo "whsec_…" en UTF-8,
  mensaje = "<timestamp>.<cuerpo crudo>"))`.
- La marca de tiempo es la del intento (no la del evento): un reintento lleva
  una nueva. Tolerancia recomendada: 300 s.
- `id` del evento = `evt_<id de la fila del outbox>` (estable entre
  reintentos, reenvíos y entre apps); las pruebas usan `evt_<hex aleatorio>`.
- Vectores compartidos: `sdks/conformance/webhook-vectors.json` (los usan el
  kernel, el SDK JS y el SDK Python).

## Catálogo y mapeo

Fuente única: `apps/institutional-kernel-api/src/application/webhooks/catalog.ts`
(tipo, versión, título, descripción, scope, JSON Schema de `data`, ejemplo).
De ahí salen `GET /events/catalog` (público), la validación de suscripciones y
`docs/developers/catalogo-de-eventos.md` (`pnpm docs:events`; el test
`catalog.spec.ts` y `pnpm contracts:events-catalog` fallan si quedó viejo).

| Público | Interno (`kernel-events-contract.md`) | Scope |
|---|---|---|
| `membership.created.v1` | `kernel.membership.created.v1` | `kernel.service.memberships.read` |
| `membership.activated.v1` | `kernel.membership.activated.v1` (alta, regreso de licencia, reincorporación) | ídem |
| `membership.ended.v1` | `kernel.membership.status-changed.v1` hacia `INACTIVE`/`GRADUATED`, `kernel.membership.transferred.v1` (`reason: TRANSFERRED`) | ídem |
| `appointment.activated.v1` | `kernel.appointment.activated.v1` | `kernel.service.authorities.read` |
| `appointment.ended.v1` | `kernel.appointment.ended.v1`; `kernel.appointment.revoked.v1` solo si el cargo había asumido (`activatedAt`) | ídem |
| `organization.updated.v1` | `kernel.organization.updated.v1` (solo si cambió algún campo público), `.activated`, `.deactivated`, `.moved` | `kernel.service.organizations.read` |
| `organization.archived.v1` | `kernel.organization.archived.v1` | ídem |
| `person.updated.v1` | `kernel.person.updated.v1` | `kernel.service.persons.read` |
| `period.created.v1` | `kernel.period.created.v1` | `kernel.service.periods.read` |
| `ping.v1` | — (botón "Enviar prueba") | — |

Fuera del catálogo por ahora: licencias (`ON_LEAVE`), elección de cargos,
solicitudes y transferencias en curso, cuentas, roles y módulos.

`data` usa las **mismas vistas que la API de datos** (`views.ts`):
`MemberView`, `AuthorityView`, `OrganizationView`, `PersonView`,
`PeriodView`. Se lee el estado del agregado al hacer el fan-out (segundos
después del hecho), no se copia el payload interno.

### Filtro por app (`renderForApp`)

1. **Scope:** la app tiene que tener el scope del tipo. Se valida al
   suscribirse (400 con el permiso que falta) y otra vez en cada fan-out
   (los scopes pueden cambiar).
2. **Árbol de organizaciones:** el evento se entrega solo si alguna de sus
   organizaciones está en el árbol de la app (su organización y
   descendientes, la misma regla que `ServiceApiGuard`). `organizationId` del
   cuerpo es esa organización. Para `person.updated.v1` las organizaciones son
   las de las membresías de la persona (cualquier estado, igual que la API de
   datos), primero las vigentes.
3. **PII:** `email`, `phone` y `birthDate` solo con
   `kernel.service.persons.contact.read`; sin él se omiten. `changedFields`
   usa nombres públicos (`primaryEmail` → `email`) y nunca menciona campos de
   contacto sin ese scope; si solo cambiaron campos que la app no puede ver,
   la app **no recibe el evento**. Nunca: notas internas, `metadata`,
   `attributes`, datos de contacto del club.

### Emisiones internas agregadas

Baratas y sin cambio de comportamiento (solo payload):

- `kernel.person.updated.v1` y `kernel.organization.updated.v1` llevan
  `changedFields` (nombres, no valores), como ya pedía
  `kernel-events-contract.md`.
- Las transiciones de membresía llevan `organizationId`, `personId`,
  `transitionType`, `effectiveAt` y `tenantId` = organización.

## Reintentos y desactivación

| Intento | Espera después de la falla anterior |
|---|---|
| 1 | inmediato |
| 2 | 1 min |
| 3 | 5 min |
| 4 | 30 min |
| 5 | 2 h |
| 6 | 6 h |
| 7 en adelante | 12 h |

±10 % de jitter. Ventana: 72 h desde que se creó la entrega
(`retryUntil`); el último intento se ajusta a ese instante y, si falla, la
entrega queda `FAILED`. Sin jitter son 12 intentos (0, 1 min, 6 min, 36 min,
2 h 36, 8 h 36, 20 h 36, 32 h 36, 44 h 36, 56 h 36, 68 h 36, 72 h).

- Éxito = cualquier 2xx dentro de 10 s. 3xx (no se siguen redirecciones),
  4xx, 5xx, timeout o error de red = falla.
- **Reenvío manual** (`…/redeliver`): el mismo evento, un intento ya. Si
  falla vuelve a `FAILED`; no reinicia la ventana de 72 h. Sobre una entrega
  `PENDING` solo adelanta el próximo intento.
- **Prueba** (`…/test`): un `ping.v1`, un solo intento.
- **Desactivación automática:** `failingSince` marca el inicio de la racha de
  fallas (se limpia con cualquier éxito). Si una falla ocurre cuando la racha
  ya lleva 72 h, el endpoint pasa a `DISABLED` con `AUTO_FAILURES`, se
  registra `autoDisableWebhookEndpoint` (actor `SYSTEM`) y la consola lo
  muestra. Mientras está desactivado no se le reparten eventos nuevos y sus
  entregas pendientes quedan en pausa; al reactivarlo se reinicia la racha.
  Los eventos de mientras no se guardan: la app se pone al día con
  `updatedSince` de la API de datos.
- Una app `SUSPENDED` o `REVOKED` no recibe ni acumula eventos.

## Seguridad (SSRF)

El kernel hace POST desde la red de producción a URLs que elige un tercero.
`ssrf-guard.ts`:

- Solo `https`. Sin usuario/contraseña en la URL, sin `#`.
- Ningún destino no público: loopback, privadas (10/8, 172.16/12,
  192.168/16, fc00::/7), link-local (169.254/16 —metadatos de la nube—,
  fe80::/10), CGNAT, multicast, reservadas, documentación, IPv4 embebida en
  IPv6 (`::ffff:…`, NAT64), y nombres `localhost`, sin punto, `.local`,
  `.internal`, `.lan`.
- Se verifica **al registrar** (sintaxis + DNS) **y en cada envío**, después
  de resolver el DNS: todas las direcciones tienen que ser públicas, y el
  socket se conecta a la dirección verificada (`lookup` propio), así un
  cambio de DNS entre la verificación y la conexión (DNS rebinding) no
  sirve.
- `KERNEL_WEBHOOKS_ALLOW_INSECURE=true` levanta las reglas de http y
  direcciones privadas, para un kernel local, sandbox o tests
  (`http://localhost:3000/api/webhooks`). Nunca en producción.

## API

Mismos permisos que administrar la app (`kernel.app.read` para leer,
`kernel.app.manage` para cambiar, sobre la organización de la app) y entrada
en el registro de auditoría de cada cambio (`createWebhookEndpoint`,
`updateWebhookEndpoint`, `deleteWebhookEndpoint`, `rotateWebhookSecret`,
`sendWebhookTest`, `redeliverWebhook`; nunca el secreto). Contrato en
`kernel-openapi.yaml`, tags `Webhooks` y `Events`.

| Operación | Ruta |
|---|---|
| `listWebhookEndpoints` / `createWebhookEndpoint` | `GET/POST /developer/apps/{appId}/webhooks` |
| `getWebhookEndpoint` / `updateWebhookEndpoint` / `deleteWebhookEndpoint` | `GET/PATCH/DELETE /developer/apps/{appId}/webhooks/{endpointId}` |
| `rotateWebhookSecret` | `POST …/{endpointId}/rotate-secret` |
| `sendWebhookTest` | `POST …/{endpointId}/test` (202) |
| `listWebhookDeliveries` | `GET …/{endpointId}/deliveries?status&cursor&limit` |
| `redeliverWebhook` | `POST …/{endpointId}/deliveries/{deliveryId}/redeliver` (202) |
| `getEventCatalog` | `GET /events/catalog` (público) |
| `streamWebhookEvents` | `GET /developer/apps/{appId}/webhooks/stream` y `GET /developer-apps/{appId}/webhooks/stream` |

Las rutas de administración cuelgan de `/developer/apps/{appId}` como el resto
de la consola (E2). El stream existe además en
`/developer-apps/{appId}/webhooks/stream`, la ruta que fija el contrato E6/E7
para `mirotaract webhooks listen`.

### Stream de desarrollo (SSE)

Para `mirotaract webhooks listen` (E6). Solo existe con
`KERNEL_WEBHOOK_STREAM_ENABLED=true` (404 si no). Autenticación: Basic con
`client_id:client_secret` de la app (no una sesión); el `appId` de la ruta
tiene que ser el de esas credenciales.

```text
event: ready
data: {"secret":"whsec_…","appId":"…","clientId":"mra_…","organizationId":"…","events":["membership.activated.v1",…]}

event: webhook
id: evt_…
data: {"headers":{"Content-Type":"application/json","MiRotaract-Webhook-Id":"evt_…","MiRotaract-Webhook-Timestamp":"…","MiRotaract-Signature":"v1=…","User-Agent":"MiRotaract-Webhooks/1"},"body":"<json crudo>"}

: keepalive
```

- Lee el outbox directamente (no necesita endpoints registrados ni el
  worker), aplica el mismo `renderForApp` y firma con un secreto propio del
  stream, anunciado en `ready`. `?events=a,b` filtra; por defecto, todos los
  tipos que los scopes de la app permiten.
- Solo eventos desde que se abre la conexión. Revisa cada segundo; cada 60 s
  vuelve a leer los scopes y el árbol, y corta (`event: end`) si la app dejó
  de estar activa.

## Variables de entorno nuevas

| Variable | Por defecto | Uso |
|---|---|---|
| `KERNEL_WEBHOOKS_ALLOW_INSECURE` | `false` | `true` permite http y destinos privados/locales (kernel local, sandbox, tests). |
| `KERNEL_WEBHOOK_STREAM_ENABLED` | `false` | `true` habilita el stream SSE para la CLI. |
| `KERNEL_WEBHOOKS_DISPATCH_ENABLED` | `true` | `false` apaga el dispatcher aunque el proceso corra jobs. |
| `KERNEL_WEBHOOKS_DISPATCH_INTERVAL_MS` | `5000` | Cada cuánto el worker reparte y envía. |

`KERNEL_SIGNING_KEY_SECRET` (existente) tiene que ser el mismo en la API y en
el worker: la API cifra el secreto al crearlo y el worker lo descifra para
firmar.

## Pruebas

- Unitarias (`src/application/webhooks/*.spec.ts`): firma y vectores
  compartidos, cifrado del secreto, calendario de reintentos y
  desactivación, mapeo y filtro por scope/árbol/PII, guardia SSRF (IPv4/IPv6,
  DNS con un registro privado, redirecciones, timeout), catálogo (cada
  ejemplo valida contra su JSON Schema; el Markdown está al día).
- E2E (`test/webhooks.e2e-spec.ts`, con validación de respuestas OpenAPI):
  app + endpoint hacia un receptor local, activación de una membresía →
  entrega firmada verificada por el kernel, el SDK JS y el SDK Python;
  eventos de otro club no llegan; receptor caído → reintento con el mismo
  `id`; ventana vencida → `FAILED`; reenvío manual; prueba con tres
  dispatchers en paralelo (cada ping llega una vez); rotación con doble
  firma; desactivación manual y automática; stream SSE verificado con el
  SDK; borrado en cascada; auditoría.
- SDKs: `webhooks.test.ts` (JS) y `tests/test_webhooks.py` corren los
  vectores; la suite de conformidad suma `webhooks.signature_vectors`
  (offline) y `webhooks.event_catalog` (contra el kernel).

## Pendientes

- Entregas `SUCCEEDED`/`FAILED` no se purgan todavía (agregar un job de
  retención, p. ej. 30 días).
- No hay registro por intento (solo el último); la consola muestra el último
  código, latencia y error.
- Sin aviso por email al dueño de la app cuando un endpoint se desactiva solo.
- Licencias (`ON_LEAVE`), cargos electos y transferencias en curso no están en
  el catálogo.
