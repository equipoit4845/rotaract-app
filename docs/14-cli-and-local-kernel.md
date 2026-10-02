# 14 · CLI `mirotaract` y kernel local (E6)

Épica E6 del plan _Mi Rotaract Developers_: "Que empezar sea un comando y que
se pueda desarrollar sin conexión y sin datos reales". Guía de uso para
desarrolladores: [developers/cli.md](developers/cli.md). Este documento fija
las decisiones de diseño.

## Piezas

| Pieza | Ubicación |
|---|---|
| CLI (`@mirotaract/cli`, bin `mirotaract`) | `packages/cli` (ESM, Node ≥ 20, JavaScript sin build) |
| Plantillas | `packages/cli/templates/{next,fastapi,flutter}` |
| Compose del kernel local | `packages/cli/compose/docker-compose.yml` (+ `docker-compose.build.yml`) |
| Distrito sintético | `prisma/seed-synthetic.ts` (`pnpm db:seed:synthetic`) |
| Mock del contrato E7 para pruebas | `packages/cli/test/support/mock-kernel.mjs` |

Dependencias de la CLI: `openapi-typescript` (tipos TS) y `yaml` (tipos
Python). El parseo de argumentos es `node:util.parseArgs`; Docker se invoca
con `child_process.spawn` sin shell.

## Kernel local

- **Proyecto Compose fijo `mirotaract-dev`** (`-p` y `name:`), nunca el de
  producción (`rotaract-app`). Puertos por defecto 54321 (API) y 54322
  (web), solo en `127.0.0.1`; 3000/3001/4222/5432/6379/8222 se rechazan.
  Postgres y NATS no publican puertos.
- **Servicios**: `postgres`, `nats` (el outbox publica ahí; es liviano y
  evita que los jobs fallen en bucle), `api` (también hace de worker:
  `KERNEL_JOBS_ENABLED=true`, intervalo 5 s), `web`, y `setup` (perfil
  `setup`, one-off). Redis no se incluye: el kernel lo trata como opcional.
- **Mismo puerto adentro y afuera.** La web tiene la URL de la API fija en el
  build (`NEXT_PUBLIC_KERNEL_API_URL`) y sus route handlers del servidor la
  usan; por eso la API escucha dentro del contenedor en el puerto del host y
  la web comparte su red (`network_mode: service:api`). `localhost:<api>`
  funciona igual desde el navegador, desde la app del desarrollador y desde
  el servidor de la web. La imagen de la web se etiqueta con el puerto de la
  API (`mirotaract-dev/kernel-web:local-<puerto>`).
- **Variables del kernel**: `NODE_ENV=production` (el mismo comportamiento que
  producción: sin bypass de `x-service-api-key`, `Secure` en cookies),
  `KERNEL_ISSUER_URL=http://localhost:<api>/api/kernel/v1`,
  `KERNEL_PUBLIC_WEB_URL=http://localhost:<web>`, CORS para la web y el
  origen de la app, `KERNEL_RATE_LIMIT_ENABLED=false`,
  `KERNEL_WEBHOOK_STREAM_ENABLED=true`, `KERNEL_WEBHOOKS_ALLOW_INSECURE=true`
  (E7: stream para `webhooks listen` y endpoints `http://localhost`), sin
  correo saliente. `JWT_SECRET`, `KERNEL_SIGNING_KEY_SECRET` y la contraseña
  de Postgres se generan una vez y se guardan en `~/.mirotaract/dev/`
  (`MIROTARACT_HOME` lo cambia), con permisos `600`.
- **Secuencia de `dev up`**: `build api web` (si hay `--kernel-repo`) →
  `up --wait postgres nats` → `run --rm setup` (migraciones
  `prisma migrate deploy`, `prisma/seed.ts`, `prisma/seed-synthetic.ts
  --json`) → `up --wait api web` → espera `/.well-known/openid-configuration`
  → escribe `.env.local` y el estado.
- **Credenciales**: el seed imprime una línea
  `MIROTARACT_SANDBOX_JSON={…}` en stdout (los logs van a stderr); la CLI la
  parsea. El secreto en claro solo existe en esa salida y en `.env.local`
  del proyecto (permisos `600`); el estado de la CLI guarda `client_id` e
  id, nunca el secreto.

### Imágenes publicadas (más adelante)

El compose referencia `${MIROTARACT_API_IMAGE:-mirotaract-dev/kernel-api:local}`
y `${MIROTARACT_WEB_IMAGE:-…}`; la construcción está aislada en el overlay
`docker-compose.build.yml`, que la CLI agrega solo con `--kernel-repo`.
Cuando haya imágenes en un registry, alcanza con definir esas variables (o
cambiar los valores por defecto) y usar `--no-build`; el seed sintético ya
viaja dentro de la imagen de la API (el Dockerfile copia el repo). Requisito
para publicarlas: la imagen de la web no puede tener la URL de la API fija
en el build (hoy `NEXT_PUBLIC_KERNEL_API_URL` es un build arg), o hay que
publicar una por puerto.

## Distrito sintético (`prisma/seed-synthetic.ts`)

- **Idempotente**: organizaciones por `code` (`SBX-D9999`, `SBX-C01…06`),
  personas por `externalReference` (`sbx:person:NN`), membresías por
  `(organizationId, personId)`, períodos por `(organizationId, code)`,
  cargos activos por (organización, período, cargo). Correrlo dos veces deja
  los mismos conteos (7 organizaciones, 60 personas, 60 membresías, 14
  cargos activos, 7 cuentas, 2 apps, 1 secreto vigente).
- **Fiel al kernel**: escribe con Prisma lo mismo que producen los comandos:
  transiciones de membresía, rol `MEMBER` para `ACTIVE`/`ON_LEAVE` (regla de
  `syncMemberRole`), `PLATFORM_USER` para cada cuenta, y el rol derivado de
  cada cargo activo con `sourceAppointmentId` (`ORGANIZATION_TREE` para los
  cargos distritales). Las credenciales usan los mismos helpers del kernel
  (`credentials.ts`: `mra_…`, `mrs_…`, hash argon2id) y los scopes se validan
  contra `scopes.ts`.
- **Datos claramente falsos**: apellidos como _Ejemplo_, _Prueba_,
  _Simulacro_; correos `@example.org`; descripción "Organización sintética";
  `attributes.synthetic = true`.
- **Apps**: "App local (sandbox)" `CONFIDENTIAL` del distrito con
  `client_credentials` + `authorization_code`, scopes OIDC y de servicio de
  lectura (sin `persons.contact.read`), redirects
  `http://localhost:3000/auth/callback`, `http://localhost:8000/auth/callback`
  y los que pida la CLI (`--app-url`, `--redirect-uri`,
  `MIROTARACT_SANDBOX_REDIRECT_URIS`); "App móvil local (sandbox)" `PUBLIC`
  con redirect `http://localhost:8765/callback`. Cada corrida emite un
  secreto nuevo y revoca los anteriores (el plano solo existe al crearlo).
- **Nunca sobre datos reales**: aborta si existe alguna organización cuyo
  código no empiece con `SBX-` o alguna cuenta fuera de `@example.org`.
  `--force` (o `MIROTARACT_SANDBOX_FORCE=1`) lo permite en una base de
  desarrollo mezclada, **salvo** con `NODE_ENV=production`, donde no hay
  forma de forzarlo.

## Plantillas

- `{{VARIABLES}}` solo en archivos `*.tmpl`; los dotfiles se guardan como
  `_dot_*` (npm descarta `.gitignore` al publicar).
- Mientras los SDKs no estén en npm/PyPI, `init --kernel-repo` apunta las
  dependencias a la copia local (`file:…/packages/sdk-js`,
  `mirotaract[fastapi] @ file://…/sdks/python`); sin `--kernel-repo` usa la
  versión publicada (`^0.1.0`).
- **Padrón**: la API de datos acepta solo tokens de servicio (docs/12), así
  que el padrón se lee en el servidor con `client_credentials`. Como ese
  token ve toda la organización de la app, la plantilla aplica su propia
  regla: solo clubes donde la persona es socia `ACTIVE`/`ON_LEAVE`, leyendo
  sus membresías en el momento (`persons.memberships(sub)`), no de la sesión.
- **Móvil**: la app Flutter es `PUBLIC` y no llama a `/service/*`. Llama a
  `/api/members` del backend con su access token; el backend lo verifica con
  un `MiRotaractAuth` configurado con el `client_id` de la app móvil
  (`verifyAccessToken` exige ese `client_id`: un token emitido a otra app se
  rechaza) y además consulta `/oauth/userinfo` (revocaciones al instante).
- **Webhooks**: las plantillas verifican la firma del contrato E7 con código
  propio (HMAC sobre `"<timestamp>.<cuerpo crudo>"`, tolerancia 300 s,
  comparación en tiempo constante, varias `v1=` por rotación) para no
  depender de `verifyWebhook` de los SDKs, que llega con E7.

## `gen types`

Contrato: `--spec` > `GET <origen>/openapi.yaml` (lo sirve el kernel fuera
del prefijo `/api/kernel/v1`) > `<kernel-repo>/kernel-openapi.yaml`. Eventos:
`GET <base>/events/catalog`; el formato lo define E7, así que la CLI acepta
un arreglo o `{ items | events | types | data }`, con `type`/`name`/`eventType`,
`description`, `version`, `example`/`examplePayload`/`payload` (sobre completo
o solo `data`) y opcionalmente `schema`/`dataSchema`. Con esquema se usa el
esquema; si no, se infiere del ejemplo. Sin catálogo (kernel anterior a E7),
avisa y genera solo la API.

## `webhooks listen`

Implementa el contrato E6/E7: `GET /developer-apps/{appId}/webhooks/stream`
con `Authorization: Basic base64(client_id:secret)` y
`Accept: text/event-stream`; `event: ready` → `{ "secret": "whsec_…" }`
(se imprime); `event: webhook` → `{ "headers": {…}, "body": "<json crudo>" }`,
que se reenvía con `POST` byte por byte con sus encabezados (sin los de
salto: `host`, `content-length`, `connection`…), timeout 10 s, sin
reintentos (el desarrollador ve el código de respuesta). Reconexión con
backoff exponencial + jitter (0,5–1 s, hasta 30 s; respeta `retry:`), se
reinicia al recibir `ready`, y manda `Last-Event-ID` si el servidor envía
ids. 401/403/404 y otros 4xx cortan con un mensaje accionable; red, 5xx y 429
reintentan. `SIGINT`/`SIGTERM` cierran limpio (código 130); un segundo
`Ctrl-C` sale de inmediato.

## Verificación

- `pnpm --filter @mirotaract/cli test`: 60 pruebas `node:test` (parseo de
  argumentos, renderizado de plantillas, `.env.local`, plan de `dev up` y
  comandos `dev` con un Docker falso, el forwarder contra el mock SSE —
  firma, filtros, reconexión con `Last-Event-ID`, errores fatales, Ctrl-C—,
  y `gen types` TS/Python contra el mock, incluida la compilación con `tsc`
  y la importación del módulo Python).
- `mirotaract dev up` real en el VPS (proyecto `mirotaract-dev`, puertos
  54321/54322), seguido de: login completo authorization code + PKCE contra
  las plantillas `next` (build de producción) y `fastapi` hasta `/padron`
  con el padrón del club, `/api/members` con un token de la app `PUBLIC`, y
  `dev down`.
- Plantilla `flutter`: `flutter analyze` sin problemas y `flutter test` en
  `ghcr.io/cirruslabs/flutter:stable` (Flutter 3.44). El login en un
  dispositivo no se probó (ver pendientes).

## Pendientes

- **Publicación**: `@mirotaract/cli`, `@mirotaract/sdk` y `mirotaract`
  (PyPI) siguen `private`/sin publicar; las imágenes del kernel no están en
  un registry. Hasta entonces todo requiere un checkout del repo.
- **E7**: `webhooks listen` y el catálogo de `gen types` se probaron contra
  el mock del contrato; con un kernel sin E7 el stream responde 404 y la CLI
  lo explica. Hay que repetir la prueba contra el kernel real cuando E7 esté
  integrado.
- **Móvil**: el kernel rechaza esquemas propios en las direcciones de
  regreso (docs/11); en Android/iOS hacen falta App Links / Universal Links
  `https`. Para probar el login móvil contra el kernel local haría falta
  aceptar esquemas privados (RFC 8252 §7.1) en apps `PUBLIC` o un túnel
  https.
- Primer `dev up` lento (build de la web de Next en una máquina de 2 núcleos:
  ~10–15 min); con imágenes publicadas pasa a ser un `pull`.
