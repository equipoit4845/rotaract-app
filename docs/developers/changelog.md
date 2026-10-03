# Changelog

Cambios de la plataforma para desarrolladores de Mi Rotaract: la API del
kernel (`/api/kernel/v1`), "Ingresar con Mi Rotaract", los webhooks, los SDKs
oficiales y la CLI. Lo más nuevo, arriba.

Cada entrada dice de qué **tipo** es (nuevo, cambio, corrección,
deprecación, retiro) y si **rompe compatibilidad**. Un cambio que rompe
compatibilidad nunca llega sin aviso: primero se anuncia como deprecación,
con al menos 6 meses de plazo (ver [deprecaciones.md](deprecaciones.md)), y
las personas responsables de cada app activa reciben el aviso por email.

> **Cómo leer las versiones.** La API vive en `/api/kernel/v1` y no cambia de
> `v1` mientras los cambios sean compatibles: agregar campos, endpoints,
> eventos o parámetros opcionales **no** rompe compatibilidad, así que tu
> código tiene que ignorar los campos que no conoce. El contrato es
> `kernel-openapi.yaml` (versión en `info.version`).

<!-- entry: e11-gobierno -->
## 2026-10-03 · Revisión de apps, historial de accesos, límites por app y apps en el panel (E11)

**Tipo:** nuevo · **Compatibilidad:** sin cambios que rompan para las apps existentes

- **Revisión del distrito.** Toda app nueva arranca **en revisión**
  (`reviewStatus: IN_REVIEW`): solo su responsable y sus cuentas de prueba
  (`testAccountEmails`) pueden ingresar con Mi Rotaract, y su token de
  servicio solo trae datos que no son personales. El RDR la aprueba con una
  lista de control (propósito, datos, responsable, política de privacidad,
  contacto) o la rechaza con un motivo. Las apps que ya existían quedaron
  aprobadas. Campos nuevos en `DeveloperApp`: `reviewStatus`,
  `approvedScopes`, `approvedAt`, `reviewedAt`, `purpose`,
  `privacyPolicyUrl`, `contactEmail`, `testAccountEmails`, `quotaPerMinute`,
  `quotaPerDay`. Endpoints: `GET /developer/app-reviews`,
  `POST /developer/apps/{appId}/review`, `POST .../review-request`,
  `GET .../reviews`. Guía: [revision-de-apps.md](revision-de-apps.md).
- **Pedir un dato nuevo reabre la revisión** solo para ese dato: lo ya
  aprobado sigue funcionando.
- **Límites por app** por minuto y por día (100/20 000 aprobadas, 20/1 000
  en revisión). Toda respuesta trae `RateLimit-Policy` y `RateLimit`; al
  pasarse, **429** con `code: KERNEL_RATE_LIMITED` y `Retry-After`.
  `GET/PUT /developer/apps/{appId}/quota`. Guía: [limites.md](limites.md).
- **SDKs:** `MiRotaractRateLimitError` (JS y Python, subclase de
  `MiRotaractApiError`) con `retryAfter`/`retry_after` y las cabeceras
  `RateLimit`; el pedido del token reintenta ante 429; Python suma
  `max_retry_delay`.
- **Historial de accesos para cada socio:** `GET /me/app-access` y
  `GET /me/app-access/{appId}` (12 meses). En Mi Rotaract, **Apps
  conectadas** muestra el historial y permite quitar el acceso.
- **Apps del distrito en el panel:** el RDR publica apps aprobadas para
  todo el distrito, presidencias, autoridades o cargos puntuales
  (`PUT /developer/apps/{appId}/listing`, `GET /developer/app-catalog`);
  cada persona ve las suyas en `GET /me/apps` y en las tarjetas
  **Aplicaciones** de su inicio.

<!-- entry: e12-status -->

## 2026-10-03 · Página de estado, incidentes y mantenimientos (E12)

**Tipo:** nuevo · **Compatibilidad:** sin cambios que rompan

- `GET /status` y `GET /status/history`: públicos, sin token y cacheables.
  Estado de la web, la API, el inicio de sesión (OIDC), los webhooks,
  Reuniones, el portal y (cuando esté activo) el sandbox, medido cada minuto,
  con uptime de 90 días e incidentes. Ver [estado.md](estado.md).
- Página pública [/estado](/estado) en el portal y `/status.json`, que sigue
  respondiendo aunque la API esté caída.
- Los mantenimientos se anuncian con al menos 24 horas de anticipación y no
  descuentan uptime.
- El sandbox con el Distrito 9999 está listo para publicarse (ver
  [sandbox.md](sandbox.md)); se avisará aquí cuando esté en línea.

<!-- entry: crear-con-ia -->
## 2026-10-03 · "Implementar con IA" y CLI 0.2.0

**Tipo:** nuevo · **Rompe compatibilidad:** no

- Página [developers.rotaract4845.com/ia](https://developers.rotaract4845.com/ia)
  y guía [crear-con-ia.md](crear-con-ia.md): describís tu idea y te llevás un
  prompt para tu asistente de código (Claude Code, Cursor, Copilot, Codex) que
  instala las herramientas oficiales y construye la app paso a paso. El prompt
  genérico está en [`/ia/prompt.md`](https://developers.rotaract4845.com/ia/prompt.md).
- Las skills de IA se publican como paquete versionado en `/ia/skills.json`
  con su SHA-256 en `/ia/skills.json.sha256` (y sueltas en `/ia/…`). Versión
  preliminar: todavía no pasaron las evaluaciones automáticas.
- `@mirotaract/cli` 0.2.0: nuevo `mirotaract ai install --target <destino> [carpeta]`;
  `init --ai` y `ai install` funcionan sin `@mirotaract/ai-skills`, bajando y
  verificando ese paquete (`--skills-url` o `MIROTARACT_SKILLS_URL` para usar
  otra copia). Si el paquete está instalado, se sigue usando.
- `init --ai` valida los destinos antes de escribir y, si la descarga falla,
  deja la app creada y dice cómo reintentar.
- La plantilla `fastapi` sin `--kernel-repo` instala el SDK de Python desde
  PyPI (`mirotaract[fastapi]>=0.1.0`).

<!-- entry: npm-publish -->
## 2026-10-03 · SDKs y herramientas publicados en npm y PyPI (MIT)

**Tipo:** nuevo · **Rompe compatibilidad:** no

- `@mirotaract/sdk` 0.1.0, `@mirotaract/cli` 0.1.0, `@mirotaract/mcp` 0.1.0 y
  `@mirotaract/module-manifest` 1.0.0 están en npm con licencia MIT:
  `npm install @mirotaract/sdk`, `npx @mirotaract/cli init`, `npx -y @mirotaract/mcp`.
- La CLI renombró `--env-file` a `--env-path` (Node 20.6+ intercepta
  `--env-file` en cualquier posición de la línea de comandos).
- El SDK de Python `mirotaract` 0.1.0 está en PyPI (MIT): `pip install mirotaract`
  o `pip install 'mirotaract[fastapi]'`.
- Pendiente: `@mirotaract/ai-skills` (se publica cuando supere las evaluaciones).
<!-- entry: e9-portal -->

## 2026-10-03 · Portal de desarrolladores, registros de requests y avisos de deprecación (E9)

**Tipo:** nuevo · **Compatibilidad:** sin cambios que rompan

- Portal en `developers.rotaract4845.com`: guías, quickstarts por framework
  (Next.js, Express, FastAPI, Flutter), referencia de la API generada del
  contrato con ejemplos en curl, TypeScript y Python, panel "Probar",
  catálogo de eventos, `llms.txt` y este changelog.
- `GET /developer/apps/{appId}/request-logs`: los requests de tu app de los
  últimos 30 días (método, ruta, estado, código de error, latencia,
  `traceId`), con filtros por clase de estado, código y `traceId`. En la
  consola de apps, pestaña **Registros**.
- `traceId` viene **siempre** en Problem Details y en la cabecera
  `X-Trace-Id` de toda respuesta. Si mandás `traceparent`, ahora es su
  trace-id (32 caracteres hexadecimales) en vez de la cabecera completa; si
  mandás `X-Correlation-Id`, es ese valor; si no, uno generado.
- Las operaciones deprecadas responden con `Deprecation`, `Sunset` y
  `Link: rel="deprecation"`.

<!-- entry: e7-webhooks -->

## 2026-10-02 · Webhooks firmados y catálogo público de eventos (E7)

**Tipo:** nuevo · **Compatibilidad:** sin cambios que rompan

- Endpoints de webhook por app en `/developer/apps/{appId}/webhooks`:
  alta, edición, borrado, rotación del secreto, prueba (`ping.v1`),
  historial de envíos y reenvío. Mismos permisos que la app.
- Eventos de membresías, cargos, organizaciones, personas y períodos, con
  firma HMAC-SHA256 con marca de tiempo (`MiRotaract-Signature`), reintentos
  durante 72 horas y pausa automática de un endpoint que falla 72 horas
  seguidas. Solo llegan los eventos de la organización de la app (y sus
  descendientes) y de los scopes que tiene.
- `GET /events/catalog` (público) con el JSON Schema y un ejemplo de cada
  evento; [catalogo-de-eventos.md](catalogo-de-eventos.md) se genera de la
  misma fuente.
- SDKs: `verifyWebhook` (JS) y `verify_webhook` (Python).
- Corrección: las rutas que nombran un recurso (`appId`, `membershipId`,
  ...) se autorizan contra la organización de **ese** recurso; un
  `organizationId` en el cuerpo o en la URL ya no la reemplaza.

<!-- entry: e6-cli -->

## 2026-10-02 · CLI `mirotaract` y kernel local con un distrito sintético (E6)

**Tipo:** nuevo · **Compatibilidad:** sin cambios que rompan

- `mirotaract init` con plantillas `next`, `fastapi` y `flutter`: ingreso
  con Mi Rotaract, padrón del club por la API de datos y verificación de
  webhooks.
- `mirotaract dev up`: kernel local en Docker (puertos 54321 y 54322) con el
  "Distrito 9999 (sandbox)", sin datos reales, y `.env.local` listo.
- `mirotaract gen types` (TypeScript o Python) y `mirotaract webhooks
listen` para recibir webhooks en `localhost`.

<!-- entry: e5-sdks -->

## 2026-10-02 · SDKs oficiales para JavaScript/TypeScript y Python (E5)

**Tipo:** nuevo · **Compatibilidad:** sin cambios que rompan

- `@mirotaract/sdk` (ESM y CommonJS, tipado): `MiRotaract` (API de datos con
  caché del token, paginadores y ETag), `MiRotaractAuth` (PKCE, canje,
  refresh, verificación con JWKS, userinfo, revocación), middleware para
  Express y route handlers para Next.js.
- `mirotaract` para Python (sync y async, sobre `httpx` y `PyJWT`), con la
  dependencia `require_user` para FastAPI.
- Suite de conformidad común que los dos SDKs pasan contra un kernel real.
  Todavía no están publicados en npm ni en PyPI (ver
  [README.md](README.md#sdks-oficiales)).

<!-- entry: e4-data-api -->

## 2026-10-02 · API de datos v1 (E4)

**Tipo:** nuevo · **Compatibilidad:** sin cambios que rompan

- `/service/organizations`, `/service/organizations/{id}/members`,
  `/authorities`, `/periods`, `/service/persons/batch` y
  `/service/persons/{id}/memberships`, más `PersonView` y
  `OrganizationView` en las lecturas individuales.
- Paginación por cursor (`limit` de 1 a 100, 25 por defecto),
  sincronización incremental con `updatedSince` y `ETag` débil con `304` en
  todo `GET`.
- Los datos de contacto (email, teléfono, nacimiento) solo con
  `kernel.service.persons.contact.read`.
- Corrección: límites de pedidos por cliente real (no por proxy) y
  `304` también para clientes basados en `fetch`.

<!-- entry: e3-oidc -->

## 2026-10-02 · "Ingresar con Mi Rotaract" (E3)

**Tipo:** nuevo · **Compatibilidad:** sin cambios que rompan

- Proveedor OAuth 2.0 / OpenID Connect: authorization code con PKCE (S256),
  `id_token` y access tokens ES256 verificables con el JWKS público,
  `/oauth/userinfo`, refresh tokens rotativos con detección de reuso y
  `/oauth/revoke`.
- Pantalla de consentimiento y página "Apps conectadas" para que cada
  persona vea y quite el acceso de una app.

<!-- entry: e2-apps -->

## 2026-10-02 · Registro de apps y token de servicio (E2)

**Tipo:** nuevo · **Compatibilidad:** rompe compatibilidad (solo `/service/*`)

- Las apps las registra el RDR en la consola (`/developer/apps`): tipo
  `CONFIDENTIAL` o `PUBLIC`, organización, scopes, direcciones de regreso,
  rotación de secretos con 7 días de gracia, pausa y revocación.
- `POST /oauth/token` con `grant_type=client_credentials` emite un token de
  servicio ES256 (10 minutos) acotado a la organización de la app y sus
  descendientes.
- `/service/*` ya no acepta los tokens HS256 internos anteriores; solo
  tokens de servicio de una app activa. (Antes de E2 no había apps de
  terceros, así que ninguna integración externa se vio afectada.)
