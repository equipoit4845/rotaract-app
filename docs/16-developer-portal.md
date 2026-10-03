# 16 · Portal y consola de desarrolladores (E9)

Épica E9 del plan _Mi Rotaract Developers_: "Un lugar para aprender,
registrar apps y diagnosticar problemas". Este documento fija las decisiones
de diseño; lo que lee un desarrollador está en `docs/developers/` y se
publica en el portal.

| Historia | Dónde |
|---|---|
| E9.1 Quickstart por framework, probado en CI | `docs/developers/quickstart-*.md`, `scripts/check-quickstarts.mjs` (`pnpm quickstarts:check`) |
| E9.2 Explorar la API y probarla desde el navegador | `apps/developers-portal` (`/referencia`, panel "Probar") |
| E9.3 Logs de mis requests, errores y entregas | Kernel: `DeveloperAppRequestLog`, `RequestLogMiddleware`, `GET /developer/apps/{appId}/request-logs`. Consola: pestaña **Registros** |
| E9.4 Changelog, deprecación de 6 meses y avisos | `docs/developers/changelog.md`, `docs/developers/deprecaciones.md`, cabeceras `Deprecation`/`Sunset`, `notify:changelog` |

## Portal (`apps/developers-portal`)

Next.js 15 (App Router), **todo estático** salvo los archivos de `public/`:
ninguna página consulta al kernel ni a una base. Mismo aspecto que Mi
Rotaract: los tokens de color de `apps/mirotaract-web/src/app/globals.css`
(primario cranberry, neutros "mist"), Public Sans, Tailwind 4, claro/oscuro.

| Ruta | Contenido | Fuente |
|---|---|---|
| `/` | Inicio | — |
| `/docs`, `/docs/<slug>` | Cada página de `docs/developers/*.md` (README → `introduccion`), con barra lateral, índice de la página y acciones | `docs/developers` |
| `/docs/<slug>.md` | El Markdown crudo (`text/markdown`, CORS abierto) | `public/docs`, copiado al construir |
| `/quickstarts` | Tarjetas de los cuatro quickstarts | `docs/developers/quickstart-*.md` |
| `/referencia`, `/referencia/<tag>` | Referencia generada de `kernel-openapi.yaml`, agrupada por tag | el contrato |
| `/eventos` | Catálogo de eventos | `catalogo-de-eventos.md` (generado del catálogo del kernel, `pnpm docs:events`) |
| `/changelog` | Changelog | `changelog.md` |
| `/r`, `/r/<item>.json` | Registro shadcn de E8 | `packages/registry/dist/r` |
| `/llms.txt`, `/llms-full.txt` | Índices para asistentes de E10 | `scripts/build-llms-txt.mjs` → `dist/llms` |
| `/openapi.yaml`, `/search-index.json` | Contrato e índice de búsqueda | generados |

### Contenido en tiempo de build

`scripts/prepare-content.mjs` corre antes de `next build` (`prebuild`) y
genera `src/generated/*.json` y los archivos de `public/` (todo eso está en
`.gitignore`). Agrupa las páginas en la barra lateral según una lista fija;
**una página nueva en `docs/developers` aparece sola** en "Más guías" (así
entran las guías de E8 y E10 sin tocar el portal).

Los insumos de otras épicas se consumen **solo por sus interfaces del
contrato** y son opcionales: si `packages/registry/dist/r/registry.json` no
existe, `/r` muestra que el registro todavía no se publicó; si
`scripts/build-llms-txt.mjs` no existe, `/llms.txt` no se publica. En los
dos casos el build sigue y lo avisa por consola. Los tests usan fixtures
(`apps/developers-portal/test/fixtures`). La imagen Docker compila
`packages/registry` antes del portal cuando el paquete existe.

### Markdown

`marked` (GFM) con un renderer propio: ids de encabezados estables
(minúsculas, sin acentos), enlaces entre guías (`webhooks.md#firma` →
`/docs/webhooks#firma`), enlaces a archivos del repositorio como texto (no
hay página para ellos), bloques de código con el nombre de archivo
(`file=`), botón "Copiar" y la marca **probado en CI** para los bloques
`runnable`. Las entradas del changelog (`<!-- entry: id -->`) se convierten
en anclas (`/changelog#e9-portal`), las mismas que usan los emails.

Cada página tiene **Copiar como Markdown**, **Ver .md**, **Abrir en Claude**
(`https://claude.ai/new?q=…`) y **Abrir en ChatGPT**
(`https://chatgpt.com/?q=…`), con un prompt que apunta al `.md` de la
página. La URL absoluta sale de `NEXT_PUBLIC_SITE_URL` (por defecto
`https://developers.rotaract4845.com`).

### Búsqueda

Índice estático (`/search-index.json`, ~150 KB) con una entrada por sección
`##`/`###` de cada guía y una por operación de la API. Se descarga al
enfocar el buscador (atajo `/`); todas las palabras tienen que aparecer, sin
importar acentos, y pesan más en el título. Sin servicios externos.

### Referencia de la API

Generada del contrato en el build (`src/lib/openapi.ts`): por cada
operación, método y ruta, resumen y descripción, `operationId`, cómo se
autentica (sesión, token de servicio, credenciales de la app, access token de
una persona o pública, según `security`), el permiso
(`x-required-permission`), parámetros, cuerpo y respuestas con sus esquemas
(con `$ref` resueltos y ciclos cortados) y ejemplos:

- **curl**, con las cabeceras que exige (`Idempotency-Key`, Basic para
  `/oauth/token`) y un cuerpo de ejemplo armado del esquema.
- **TypeScript** con `@mirotaract/sdk` y **Python** con `mirotaract`: las
  operaciones de `/service/*` usan el método del SDK cuando existe
  (`client.members.list(...)`, `client.permissions.check(...)`) y si no
  `client.request(...)`; `/oauth/*` usa `MiRotaractAuth`. Las operaciones de
  la consola (las que exigen el token de una sesión) no las envuelven los
  SDKs: el ejemplo es `fetch`/`httpx` y lo dice.

Las operaciones `deprecated` aparecen tachadas con su fecha de sunset. Los
tags se dividen en **Para apps** (`OAuth`, `Service`, `Events`, `Webhooks`,
`DeveloperApps`, `RequestLogs`, `Modules`) y **Plataforma**.

### Panel "Probar"

Manda la operación desde el navegador (`fetch`, `credentials: "omit"`,
`redirect: "error"`) a una **URL base configurable**, por defecto el kernel
local `http://localhost:54321/api/kernel/v1`, con un token que el
desarrollador pega.

- **El token (y el client_id/secreto para `/oauth/token`) vive solo en el
  estado de React** del `TryProvider`: nunca en `localStorage`, cookies ni
  la URL. Sobrevive a la navegación dentro del portal y se pierde al
  recargar; hay un botón para olvidarlo.
- **Nada sale hacia un kernel que no sea local sin confirmación
  explícita**: cualquier host que no sea `localhost`/`127.0.0.1`/`::1`/
  `*.localhost` muestra un aviso permanente, y cada envío abre una
  confirmación que dice el destino y si el método puede cambiar datos (con
  un texto más fuerte para `*.rotaract4845.com`). Fuera de localhost solo se
  acepta `https://`.
- Muestra estado, demora, `X-Trace-Id` (para buscarlo en **Registros**),
  `Deprecation`/`Sunset`, `ETag` y el cuerpo.
- CORS: el kernel local de la CLI acepta `http://localhost:3004` y
  `https://developers.rotaract4845.com`
  (`MIROTARACT_DEV_PORTAL_ORIGINS`). **El kernel de producción no** incluye
  el portal en `KERNEL_CORS_ORIGINS`, así que hoy el navegador bloquea
  cualquier pedido a producción desde el portal aunque se confirme. Si el
  distrito quiere habilitarlo, alcanza con agregar el origen; la
  confirmación ya está.

La lógica (qué es local, armado del pedido, faltantes) está en
`src/lib/try-request.ts`, sin dependencias y con tests.

### Despliegue

- `output: "standalone"`; imagen `infra/docker/developers-portal.Dockerfile`
  (`node apps/developers-portal/server.js`, usuario `node`, healthcheck).
- Servicio de compose `developers-portal`: `127.0.0.1:3004`,
  `restart: unless-stopped`, variables con valores por defecto vacíos
  (`DEVELOPERS_PORTAL_SITE_URL`). Detrás del túnel/proxy como
  `developers.rotaract4845.com`.

```bash
docker compose build developers-portal && docker compose up -d developers-portal
```

- Local: `pnpm --filter @mirotaract/developers-portal dev` (puerto 3004).

## Registros de requests (E9.3)

### Qué se registra

Una fila por request **autenticado como una app**:

| Cómo se autenticó | Marca en el request |
|---|---|
| Token de servicio (`client_credentials`) en `/service/*` | `request.service.clientId` (ServiceApiGuard) |
| Access token de una persona emitido a la app (`client_id`/`azp`) en `/oauth/userinfo` | `request.oidc.clientId` (OidcAccessGuard) |
| Credenciales de la app en `/oauth/token` y `/oauth/revoke` | `markDeveloperAppRequest()` en el controlador, **después** de autenticar al cliente |

No se registran: sesiones de personas (la consola), pedidos anónimos, el
bypass de desarrollo `x-service-api-key`, ni intentos con credenciales
inválidas (no se sabe de qué app son; registrarlos por el `client_id`
declarado permitiría a cualquiera ensuciar los registros de otra app).

Campos (`DeveloperAppRequestLog`): app, método, **plantilla de la ruta**
(`/service/organizations/{organizationId}`, nunca la URL real: tendría ids),
estado, `code` y `type` del error (Problem Details, o el `error` de OAuth con
`type: oauth`), latencia, `traceId`, instante e **IP truncada** (IPv4 /24,
IPv6 /48; la IP real del cliente detrás del túnel, con la misma regla que el
rate limit). **Nunca** cuerpos, query strings, tokens ni datos personales.

### Cómo se escribe

`RequestLogMiddleware` (registrado en `AppModule.configure`) arma la entrada
cuando termina la respuesta (`finish`, o `close` si el cliente cortó) y la
encola en `RequestLogWriter`, que **no toca la base en el camino del
request**: escribe con `createMany` cada 1 s o al juntar 200 entradas. El
buffer es acotado (10 000; las que sobran se descartan y se cuentan) y un
lote que falla se descarta con un warning: los registros son diagnóstico,
nunca motivo para frenar o romper un pedido. `client_id` → `appId` se
resuelve en el lote, con caché. Al apagar se vacía el buffer.

Sin clave foránea a `DeveloperApp` a propósito (escritura asíncrona y
vencimiento propio). Índices `(appId, createdAt)`, `(appId, traceId)` y
`(createdAt)`. Retención de **30 días**: `RequestLogsService.purgeExpired()`
cada hora donde corren los jobs (el worker; `KERNEL_JOBS_ENABLED`).

Variables: `KERNEL_REQUEST_LOGS_ENABLED` (por defecto activo),
`KERNEL_REQUEST_LOGS_FLUSH_MS`, `KERNEL_REQUEST_LOGS_BATCH_SIZE`,
`KERNEL_REQUEST_LOGS_MAX_BUFFERED`,
`KERNEL_REQUEST_LOGS_RETENTION_INTERVAL_MS`. Migración
`20261004110000_request_logs_e9`.

> Con varias réplicas de la API cada una tiene su buffer; un corte abrupto
> (kill -9) pierde como máximo el último segundo de registros.

### API

`GET /developer/apps/{appId}/request-logs?status=&code=&traceId=&from=&to=&cursor=&limit=`
(contrato: tag `RequestLogs`). Mismo permiso que leer la app
(`kernel.app.read` en la organización **de la app**, vía
`developerAppOrganization` en `KernelAccessGuard`; un `organizationId` que
mande el cliente no la reemplaza). `status` acepta una clase (`4xx`),
`error` (4xx y 5xx) o un código exacto; `from` inclusivo, `to` exclusivo;
50 por página por defecto, 100 como máximo; del más reciente al más viejo,
cursor opaco.

### traceId

Cada request recibe un `traceId`: el trace-id de un `traceparent` W3C
válido, si no un `X-Correlation-Id` seguro (`[A-Za-z0-9._:-]{1,128}`), si no
32 hex aleatorios. Viaja en la cabecera `X-Trace-Id` de **toda** respuesta,
en `traceId` de **todo** Problem Details (antes solo si el cliente mandaba
cabecera, y con el `traceparent` completo) y en el registro. CORS expone
`X-Trace-Id`, `Deprecation`, `Sunset` y `Link`, y acepta `traceparent`.

### Consola

Pestaña **Registros** en `/developer/apps/[appId]`: filtros por resultado
(todos, errores, 2xx, 4xx, 5xx), código de error y traceId; "Ver más" sigue
el cursor; tocar un traceId filtra por él; una pista corta por estado ("Sin
permiso o fuera del alcance"...). En **Webhooks**, cada envío que no se
entregó tiene "Ver registros de ese momento": abre Registros con los pedidos
de la app ±10 minutos alrededor del último intento (un receptor suele fallar
porque su propia llamada a la API falló). No hay un vínculo exacto entre una
entrega y un request: la entrega es saliente y el request entrante.

## Changelog y deprecación (E9.4)

- `docs/developers/changelog.md`: una entrada por cambio con
  `<!-- entry: <id> -->`, título con fecha, **Tipo** y **Compatibilidad**
  (`rompe compatibilidad` la marca como tal en el email). Entradas de E2 a
  E7 sacadas del historial de git, y E9.
- `docs/developers/deprecaciones.md`: qué es compatible, qué rompe, 6 meses
  de plazo, calendario y cómo se avisa.
- **Cabeceras**: una operación con `deprecated: true`, `x-deprecated-at` y
  `x-sunset` en el contrato responde con `Deprecation: @<unix>` (RFC 9745),
  `Sunset: <fecha HTTP>` (RFC 8594) y `Link: <…/docs/deprecaciones#<operationId>>; rel="deprecation"`
  (o `x-deprecation-link`). `DeprecationMiddleware` lee el contrato al
  arrancar; sin contrato no agrega nada. `pnpm contracts:openapi` rechaza
  una deprecación sin fechas o con menos de 6 meses.
- **Avisos por email**:

```bash
pnpm --filter @mirotaract/institutional-kernel-api notify:changelog -- --entry <id> [--dry-run] [--preview]
```

Un email por cuenta **activa** dueña (`ownerPersonId`) de al menos una app
**activa**, con la lista de sus apps, por el `NotificationService`
(ClickMail). `--dry-run` lista destinatarios (enmascarados) sin enviar; sin
`--dry-run` exige `CLICKMAIL_API_KEY` (si falta, falla en vez de "enviar"
nada). Clave de idempotencia `changelog:<id>:<hash del email>`: correrlo dos
veces no duplica. `DEVELOPERS_PORTAL_URL` cambia los enlaces. En
producción: `docker compose exec api pnpm --filter
@mirotaract/institutional-kernel-api notify:changelog -- --entry <id> --dry-run`.

## Quickstarts probados en CI (E9.1)

`docs/developers/quickstart-{nextjs,express,fastapi,flutter}.md`. En los
bloques de código, el _info string_ marca qué se verifica:

| Marca | Qué hace `pnpm quickstarts:check` |
|---|---|
| ` ```ts runnable file=src/server.ts ` | Arma un proyecto por quickstart en `apps/developers-portal/.quickstarts/<nombre>` y corre `tsc --noEmit` (strict) contra `@mirotaract/sdk` compilado y los tipos de Next.js, React y Express. |
| ` ```python runnable file=app/main.py ` | Compila (`py_compile`), verifica que todo lo importado de `mirotaract` exista en `sdks/python` y corre `mypy` si está instalado. |
| `from=packages/cli/templates/…` | El bloque tiene que ser **idéntico** a ese archivo de la plantilla de `mirotaract init` (así quickstart y plantilla no se separan). Los bloques Dart (Flutter) se verifican así. |

Variables: `MR_PYTHON` (intérprete, por ejemplo un venv con `httpx`,
`PyJWT` y `mypy`), `MR_REQUIRE_PYTHON=true` y `MR_REQUIRE_MYPY=true` para
que falte algo sea un error y no un aviso (para CI).

```bash
MR_PYTHON=.venv/bin/python MR_REQUIRE_PYTHON=true MR_REQUIRE_MYPY=true pnpm quickstarts:check
```

El primer uso ya encontró un error real: los middlewares de
`@mirotaract/sdk/express` no eran asignables a los handlers de Express 5
con tipos estrictos (corregido en el SDK, que además tipa
`req.miRotaract`/`req.miRotaractEvent`).

## Pruebas

| Qué | Dónde |
|---|---|
| Redacción, IP truncada, plantilla de ruta, traceId | `request-log.context.spec.ts`, `request-log.middleware.spec.ts` |
| Escritura en lotes, buffer acotado, fallas | `request-log.writer.spec.ts` |
| Filtros, paginación, retención | `request-logs.service.spec.ts` |
| Cabeceras de deprecación | `deprecation.middleware.spec.ts` |
| traceId siempre en Problem Details | `problem.filter.spec.ts` |
| Changelog y emails | `changelog-notifier.spec.ts` |
| E2E (stack real): una app llama a la API, sus registros aparecen por traceId/estado/código, el RDR de otro distrito recibe 403, retención, cabeceras de deprecación | `test/request-logs.e2e-spec.ts` |
| Consola: Registros y vínculo desde Webhooks | `apps/mirotaract-web/test/runtime/request-logs.runtime.test.ts` |
| Portal: contenido, registro/llms con fixtures, "Probar", Markdown, búsqueda | `apps/developers-portal/test/portal.test.mjs` |
