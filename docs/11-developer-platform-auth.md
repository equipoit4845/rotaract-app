# 11 · Plataforma de desarrolladores: apps (E2) e "Ingresar con Mi Rotaract" (E3)

Especificación de implementación de las épicas E2 y E3 del plan
_Mi Rotaract Developers_. El contrato HTTP está en `kernel-openapi.yaml`
(tags `DeveloperApps` y `OAuth`); este documento fija las reglas que el
contrato no expresa. Ante una duda, gana este documento y se actualiza el
contrato.

## Objetivo

- **E2.** Una app de un comité se identifica ante el kernel con credenciales
  propias (`client_id` + secreto), con scopes acotados y atada a una
  organización. Nunca necesita `JWT_SECRET`.
- **E3.** Las personas entran a esas apps con su cuenta de Mi Rotaract
  (OAuth 2.0 authorization code + PKCE, OpenID Connect). Las apps verifican
  los tokens con el JWKS público.

Fuera de alcance de esta entrega: registro dinámico de clientes, `end_session`,
consentimiento granular por scope, entorno sandbox separado, eventos de
integración para apps (E7).

## Piezas compartidas (ya implementadas)

| Pieza                                      | Archivo                                                                                                                                                                                        |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modelos y migración                        | `prisma/schema.prisma` (`DeveloperApp`, `DeveloperAppSecret`, `OAuthConsent`, `OAuthAuthorizationCode`, `OAuthRefreshToken`, `SigningKey`), migración `20261002195448_developer_platform_auth` |
| Claves ES256, JWKS, emisión y verificación | `src/infrastructure/crypto/signing-key.service.ts` (`sign`, `verify`, `jwks`, `issuer`, `rotate`)                                                                                              |
| Discovery OIDC                             | `src/interfaces/http/well-known.controller.ts`                                                                                                                                                 |
| Catálogo de scopes, TTLs, audiencia        | `src/application/oauth/scopes.ts`                                                                                                                                                              |
| Error RFC 6749                             | `src/application/oauth/oauth-error.ts` (`OAuthError`)                                                                                                                                          |
| Controllers HTTP (no se modifican)         | `developer-apps.controller.ts`, `oauth.controller.ts`                                                                                                                                          |
| Autorización de rutas                      | `kernel-access.guard.ts`: `kernel.app.read` / `kernel.app.manage` evaluados en la organización de la app; rutas OAuth públicas o de sesión                                                     |
| Permisos                                   | `kernel.app.read`, `kernel.app.manage` (seed; otorgados a `DISTRICT_RDR`)                                                                                                                      |
| Variables                                  | `KERNEL_SIGNING_KEY_SECRET` (obligatoria en producción), `KERNEL_ISSUER_URL`                                                                                                                   |

`ServiceApiGuard`, `DeveloperAppsService` (alta, edición, secretos, estados), `ClientCredentialsGrant`,
`OidcService` y `OidcAccessGuard` son los puntos a implementar; sus firmas
ya existen como stubs.

## Apps (E2)

### Tipos y combinaciones válidas

| Tipo                      | Grants permitidos                                           | Scopes permitidos  |
| ------------------------- | ----------------------------------------------------------- | ------------------ |
| `CONFIDENTIAL` (servidor) | `client_credentials`, `authorization_code`, `refresh_token` | OIDC y de servicio |
| `PUBLIC` (SPA, móvil)     | `authorization_code`, `refresh_token`                       | Solo OIDC          |

Validaciones al crear y editar (400 con mensaje claro en castellano):

- `name` 2–80 caracteres; `description` hasta 500.
- `organizationId` existe y está `ACTIVE`.
- Cada scope pertenece a `OIDC_SCOPES` o `SERVICE_SCOPES`.
- Los scopes de servicio exigen `client_credentials`, y `client_credentials`
  exige `CONFIDENTIAL`.
- `authorization_code` exige el scope `openid` y al menos una
  `redirectUri`. `refresh_token` exige `authorization_code`.
- Cada `redirectUri` es una URL absoluta sin fragmento, `https:`, o `http:`
  solo para `localhost` / `127.0.0.1` (cualquier puerto). Se comparan por
  igualdad exacta.
- `ownerPersonId` es siempre la persona que ejecuta el comando (nunca el
  input). El input pasa por una allowlist (ver `allowInput`).

### Credenciales

- `clientId`: `mra_` + 20 caracteres hex aleatorios.
- Secreto: `mrs_` + 32 bytes aleatorios en base64url. Se guarda solo el hash
  argon2id y `hint` = últimos 4 caracteres. Se devuelve una única vez.
- Rotación (`POST …/secrets`): crea un secreto nuevo; los secretos vigentes
  anteriores reciben `expiresAt = ahora + 7 días` (si no vencían antes). Nunca
  hay más de dos vigentes: si ya hay dos, el más viejo se revoca en el acto.
  Una app `PUBLIC` no tiene secretos (409).
- `ClientAuthenticator.authenticate` (ya implementado, `src/application/oauth/client-authenticator.ts`): app `ACTIVE`; `PUBLIC` se autentica solo con
  `client_id` y no debe enviar secreto; `CONFIDENTIAL` necesita un secreto no
  revocado ni vencido (argon2 verify contra los vigentes). Actualiza
  `lastUsedAt`. Cualquier falla: `OAuthError("invalid_client")`, sin revelar
  si existe el `client_id`.

### Estados

`ACTIVE ⇄ SUSPENDED`, y `ACTIVE | SUSPENDED → REVOKED` (terminal). Otra
transición: 409. Revocar invalida secretos, refresh tokens y consentimientos.
Una app suspendida o revocada deja de autenticarse y sus tokens de servicio
vigentes dejan de servir en la siguiente request (ver guard).

Toda mutación usa `CommandExecutorService.execute` (idempotencia por
`Idempotency-Key`, como `KernelService.mutate`) y deja registro en
`KernelAuditLog` vía `AuditService`. Nunca se registran secretos ni hashes.

### Token de servicio (`client_credentials`)

JWT ES256 firmado con `SigningKeyService.sign`:

| Claim              | Valor                                     |
| ------------------ | ----------------------------------------- |
| `iss`              | `KERNEL_ISSUER_URL`                       |
| `aud`              | `institutional-kernel`                    |
| `sub`              | `app:<clientId>`                          |
| `client_id`, `azp` | `<clientId>`                              |
| `token_use`        | `service`                                 |
| `scope`            | scopes de servicio, separados por espacio |
| `org`              | `organizationId` de la app                |
| `exp`              | `iat + 600`                               |

Si el pedido trae `scope`, debe ser subconjunto de los scopes de servicio de
la app (`invalid_scope` si no). Sin `scope`, se emiten todos.

### `ServiceApiGuard`

- Verifica con `SigningKeyService.verify({ audience: "institutional-kernel" })`.
  Exige `token_use === "service"`. Deja de aceptar tokens HS256 firmados con
  `JWT_SECRET`. El bypass de desarrollo `x-service-api-key` se mantiene tal
  cual (nunca en producción).
- La app (`client_id`) debe seguir `ACTIVE`: se consulta en cada request.
- Mantiene el chequeo de scope por handler.
- **Alcance por organización** (E2.2). Organizaciones permitidas = `org` y sus
  descendientes. Si la ruta trae `organizationId` (path) debe estar
  permitido; `personId` → la persona tiene alguna membresía en una
  organización permitida; `accountId` → idem para su persona; los chequeos
  de autorización (`check`, `batch`) → cada `organizationId` del body debe
  estar permitido. Violación: 403 "Fuera del alcance de esta app". Sin
  `org` (bypass de desarrollo) no hay restricción.

## Ingresar con Mi Rotaract (E3)

### Flujo

1. La app redirige a `{KERNEL_PUBLIC_WEB_URL}/oauth/authorize?response_type=code&client_id&redirect_uri&scope&state&nonce&code_challenge&code_challenge_method=S256`.
2. La Web exige sesión (si no hay, `/login?next=…`), llama a
   `GET /oauth/authorize/context` y muestra el consentimiento, o lo saltea
   si `alreadyGranted`.
3. La Web envía `POST /oauth/authorize` con la decisión y navega a
   `redirectTo`.
4. La app canjea el código en `POST /oauth/token` y recibe `access_token`,
   `id_token` y, si tiene el grant, `refresh_token`.

### Validación del pedido (`authorizationContext` y `authorize`)

En este orden; los errores son 400 Problem Details y **nunca** redirigen a
una URI no registrada:

1. App existente, `ACTIVE` y con grant `authorization_code`.
2. `redirect_uri` registrada (igualdad exacta).
3. `response_type=code` (solo en context; authorize lo asume).
4. `code_challenge_method=S256` y `code_challenge` de 43–128 caracteres
   base64url.
5. Scopes: incluyen `openid` y son subconjunto de los scopes OIDC de la app.

`alreadyGranted` = consentimiento no revocado cuyos scopes cubren los
pedidos.

`authorize` con `deny` → `redirectTo = redirect_uri` + `error=access_denied`
(+ `state`). Con `approve` → upsert del consentimiento (unión de scopes,
`revokedAt = null`), código nuevo y `redirectTo = redirect_uri` + `code` (+
`state`). Los parámetros se agregan con `URL.searchParams`, conservando la
query existente de la `redirect_uri`.

### Código, PKCE y tokens

- Código: `mrc_` + 32 bytes base64url, se guarda SHA-256, vence a los 60 s y
  es de un solo uso. Se consume con `updateMany({ consumedAt: null })` y debe
  afectar exactamente una fila. Reuso, vencido, otra app, otra `redirect_uri`
  o `base64url(sha256(code_verifier)) !== code_challenge` → `invalid_grant`.
  `code_verifier` de 43–128 caracteres.
- La cuenta debe seguir `ACTIVE` al canjear y al refrescar.
- **Access token de usuario**: ES256, `aud: institutional-kernel`,
  `sub: <personId>`, `client_id`/`azp: <clientId>`, `token_use: "user"`,
  `scope` (scopes OIDC otorgados), `exp: iat + 600`. Solo sirve para
  `/oauth/userinfo`.
- **ID token**: ES256, `aud: <clientId>`, `sub: <personId>`, `azp`,
  `nonce` (si vino), `auth_time` (segundos), `exp: iat + 600`, más los claims
  de los scopes otorgados.
- **Refresh token** (solo si la app tiene el grant `refresh_token`): `mrr_` +
  48 bytes base64url, SHA-256, 30 días. Rotación en cada uso (el viejo queda
  con `revokedAt` y `replacedById`). Presentar un refresh token ya rotado
  (reuso) revoca todos los refresh tokens de esa persona con esa app y
  devuelve `invalid_grant`. El refresh exige consentimiento vigente; un
  `scope` en el refresh debe ser subconjunto del original.
- `revoke`: revoca el refresh token si pertenece a la app autenticada; para
  tokens desconocidos o access tokens responde OK (RFC 7009).

### Claims por scope (ID token y userinfo)

Minimización: membresías y cargos solo de organizaciones dentro del árbol de
la organización de la app (una app de club ve solo ese club).

| Scope         | Claims                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------- |
| `openid`      | `sub` (personId)                                                                                              |
| `profile`     | `name` (displayName o nombre + apellido), `given_name`, `family_name`, `picture` (avatarUrl o null)           |
| `email`       | `email` (email de la cuenta), `email_verified`                                                                |
| `memberships` | `memberships`: `[{ organizationId, organizationName, organizationType, status }]`, solo `ACTIVE` y `ON_LEAVE` |
| `positions`   | `positions`: `[{ organizationId, positionCode, positionName, periodId }]`, nombramientos `ACTIVE`             |

### `OidcAccessGuard` (userinfo)

Bearer → `SigningKeyService.verify({ audience: "institutional-kernel" })`,
`token_use === "user"`, app `ACTIVE`, consentimiento vigente, cuenta `ACTIVE`.
Si falla: 401 con `{ "error": "invalid_token" }` y
`WWW-Authenticate: Bearer error="invalid_token"`.

### Consentimientos

`listConsents`: consentimientos vigentes de la persona con nombre de app,
organización y scopes con su etiqueta. `revokeConsent`: marca `revokedAt` y
revoca los refresh tokens de esa persona con esa app; 404 si no había.

## Web

- `/oauth/authorize`: pantalla de consentimiento en el estilo de `AuthShell`.
  Muestra nombre de la app, organización, la lista de scopes con su etiqueta
  y los botones **Permitir** / **Cancelar**. Si no hay sesión, redirige a
  `/login?next=<url actual>` y vuelve. Los errores de validación se muestran
  en la página, sin redirigir.
- `/developer/apps` (consola, ítem "Apps" en el grupo Distrito, visible con
  `kernel.app.read`): listado por organización, alta, detalle con
  `client_id` copiable, secretos (crear, ver una única vez, revocar),
  pausar, reactivar y revocar. Lenguaje del distrito: "datos que la app puede
  leer", no "scopes".
- `/connected-apps` (menú de cuenta, "Apps conectadas"): apps a las que la
  persona dio acceso, con opción de quitar el acceso.

## Pruebas exigidas

- Unitarias de cada regla de validación, de la rotación de secretos y del
  reuso de refresh tokens.
- E2E contra un stack descartable (nunca `localhost:5432`, que es
  producción en el VPS): alta de app → `client_credentials` → llamada a
  `/service/*` dentro y fuera del alcance; suspensión que corta el acceso;
  flujo completo authorization code + PKCE → verificación del `id_token` con
  el JWKS publicado → userinfo → refresh con rotación → reuso detectado →
  revocación de consentimiento.
