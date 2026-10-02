# @mirotaract/sdk

SDK oficial de **Mi Rotaract** para JavaScript y TypeScript:

- **API de datos institucionales** (clubes, socios, autoridades, períodos,
  permisos) para el servidor de tu app, con `client_credentials`.
- **Ingresar con Mi Rotaract**: OAuth 2.0 + PKCE + OpenID Connect, con
  verificación del `id_token` contra el JWKS publicado.
- Adaptadores para **Express** y **Next.js** (App Router).
- **Webhooks**: `verifyWebhook` verifica en una línea los avisos firmados
  que Mi Rotaract le manda a tu servidor.

Funciona en Node 20+ (Node 18 con `--experimental-global-webcrypto`), en
runtimes edge y en el navegador (solo la parte de login, con una app
`PUBLIC`). ESM y CommonJS, tipos incluidos. Única dependencia: `jose`.

```bash
npm install @mirotaract/sdk
```

La URL base es la de la API del kernel, que además es el _issuer_ OIDC:
`https://api.rotaract4845.com/api/kernel/v1`. Todo lo demás (endpoint de
tokens, JWKS, pantalla de consentimiento) se descubre solo desde
`/.well-known/openid-configuration`.

## 1. Cliente de servidor (API de datos)

Pedí en la consola de Apps del distrito una app `CONFIDENTIAL` con los
"datos que la app puede leer" que necesites. La app queda atada a una
organización: solo ve esa organización y sus descendientes.

```ts
import { MiRotaract } from "@mirotaract/sdk";

const mr = new MiRotaract({
  baseUrl: process.env.MIROTARACT_BASE_URL!, // https://api.rotaract4845.com/api/kernel/v1
  clientId: process.env.MIROTARACT_CLIENT_ID!, // mra_…
  clientSecret: process.env.MIROTARACT_CLIENT_SECRET!, // mrs_… (¡nunca en el navegador!)
});

// Paginación transparente: el iterador sigue nextCursor solo.
for await (const club of mr.clubs.list({ status: "ACTIVE", type: "CLUB" })) {
  console.log(club.name);
}

const socios = await mr.members.list(clubId, { status: "ACTIVE" }).all();
const club = await mr.clubs.get(clubId);
const personas = await mr.persons.batch(ids); // de a 100, automático
const membresias = await mr.persons.memberships(personId);
const autoridades = await mr.authorities.list(distritoId, { includeDescendants: true });
const periodos = await mr.periods.list(clubId, { status: "ACTIVE" });
const { allowed } = await mr.permissions.check({
  personId,
  permission: "meetings.meeting.create",
  organizationId: clubId,
});
```

| Recurso | Métodos |
|---|---|
| `clubs` (alias `organizations`) | `list({ type, status, parentId, updatedSince, limit, ifNoneMatch })`, `get(id)` |
| `members` | `list(organizationId, { status, updatedSince, limit, ifNoneMatch })` |
| `persons` | `get(id)`, `batch(ids)`, `memberships(personId)` |
| `authorities` | `list(organizationId, { includeDescendants })` |
| `periods` | `list(organizationId, { status })` |
| `permissions` | `check({ personId, permission, organizationId, scopeType?, periodId?, resource? })`, `checkMany([...])` |

Otros: `getAccessToken()`, `grantedScopes`, `clearToken()`, `discovery()` y
`request({ method, path, query, json })` para rutas que el SDK todavía no
envuelve.

### Comportamiento

- **Token de servicio**: se pide solo y se reutiliza hasta 60 s antes de
  vencer; pedidos concurrentes comparten una sola renovación. Ante un 401 de
  la API se renueva una vez y se reintenta.
- **Reintentos**: hasta 2, con backoff exponencial y jitter, ante
  429/502/503/504 y errores de red, respetando `Retry-After`. **Nunca**
  reintenta un `POST` sin `Idempotency-Key`. Las lecturas por POST
  (`persons.batch`, `permissions.check`) mandan una clave generada por el SDK,
  así que sí se reintentan. Configurable con `maxRetries`, `retryBaseDelayMs`,
  `maxRetryDelayMs`, `timeoutMs`.
- **Paginación**: `list()` devuelve un `Paginator`: `for await`, `.all({ max })`,
  `.pages()` y `.page(cursor?)`.

### Sincronización incremental y ETag

```ts
// Primera vez
const page = await mr.members.list(clubId).page();
guardar(page.items, page.etag);

// Después
const again = await mr.members.list(clubId, { ifNoneMatch: etagGuardado }).page();
if (again.notModified) return; // 304: nada cambió
```

`ifNoneMatch` aplica a la primera página. Si el servidor responde 304,
`.page()` devuelve `{ notModified: true, etag }`, el iterador no produce
elementos y `paginator.notModified` queda en `true`. Para traer solo lo
modificado combiná con `updatedSince`.

### Errores

```ts
import { MiRotaractApiError, MiRotaractOAuthError } from "@mirotaract/sdk";

try {
  await mr.members.list(otroClub).all();
} catch (error) {
  if (error instanceof MiRotaractApiError) {
    error.status; // 403
    error.code; // "KERNEL_HTTP_403"
    error.detail; // "Fuera del alcance de esta app"
    error.traceId;
  } else if (error instanceof MiRotaractOAuthError) {
    error.error; // "invalid_client", "invalid_grant", "invalid_token"…
    error.errorDescription;
  }
}
```

`MiRotaractConfigError` indica una configuración inválida (por ejemplo, un
`clientSecret` en el navegador).

## 2. Ingresar con Mi Rotaract

```ts
import { MiRotaractAuth } from "@mirotaract/sdk";

const auth = new MiRotaractAuth({
  issuer: "https://api.rotaract4845.com/api/kernel/v1",
  clientId: "mra_…",
  clientSecret: "mrs_…", // omitilo en apps PUBLIC (SPA, móvil)
  redirectUri: "https://mi-app.org/auth/callback", // registrada, igualdad exacta
  scope: "openid profile email memberships",
});

// 1) Mandar a la persona a Mi Rotaract
const { url, codeVerifier, state, nonce } = await auth.authorizationUrl();
// guardá codeVerifier, state y nonce en la sesión del servidor → redirect(url)

// 2) En el callback
const { code } = auth.parseCallback(request.url, { state }); // valida state; access_denied → error
const tokens = await auth.exchangeCode({ code, codeVerifier, nonce });
tokens.claims; // id_token verificado: sub, name, email, memberships…
tokens.refreshToken; // si la app tiene el grant refresh_token

// 3) Después
await auth.userInfo(tokens.accessToken);
const nuevos = await auth.refresh(tokens.refreshToken!); // rota: guardá el nuevo
await auth.revoke(nuevos.refreshToken!);
```

Métodos: `discovery()`, `authorizationUrl({ scope, state, nonce, redirectUri, extraParams })`,
`parseCallback(url, { state })`, `exchangeCode({ code, codeVerifier, nonce })`,
`refresh(refreshToken, { scope })`, `verifyIdToken(idToken, { nonce, maxAgeSec })`,
`verifyAccessToken(accessToken)`, `userInfo(accessToken)`, `revoke(token)`.

El JWKS se descarga con el mismo `fetch` del SDK, se cachea 10 minutos y se
vuelve a pedir si llega un `kid` desconocido (rotación de claves). Se verifica
firma ES256, `iss`, `aud` (= tu `clientId`), `exp`, `azp` y `nonce`.

**Navegador**: usá una app `PUBLIC` (solo `clientId` + PKCE). Si el SDK
detecta un `clientSecret` en un entorno tipo navegador lanza
`MiRotaractConfigError`.

## 3. Next.js (App Router)

Sesión en una cookie `httpOnly` cifrada (JWE `dir` + A256GCM con una clave
derivada de `secret`). La cookie de la transacción de login (state, nonce y
code verifier) también va cifrada y dura 10 minutos.

```ts
// lib/mirotaract.ts
import { MiRotaractAuth } from "@mirotaract/sdk";
import { createMiRotaractNext } from "@mirotaract/sdk/next";

export const mr = createMiRotaractNext({
  auth: new MiRotaractAuth({
    issuer: process.env.MIROTARACT_ISSUER!,
    clientId: process.env.MIROTARACT_CLIENT_ID!,
    clientSecret: process.env.MIROTARACT_CLIENT_SECRET!,
    redirectUri: `${process.env.APP_URL}/auth/callback`,
  }),
  secret: process.env.SESSION_SECRET!, // 32+ caracteres
  scope: "openid profile email memberships",
  sessionMaxAgeSec: 8 * 60 * 60,
});

// app/auth/login/route.ts     → export const GET = mr.login;   (?returnTo=/panel)
// app/auth/callback/route.ts  → export const GET = mr.callback;
// app/auth/logout/route.ts    → export const POST = mr.logout;

// app/panel/page.tsx
import { cookies } from "next/headers";
const session = await mr.getSession(await cookies());
if (!session) redirect("/auth/login?returnTo=/panel");
session.user.name;
```

- La sesión dura `sessionMaxAgeSec` (8 h por defecto), independiente de los
  10 minutos del `id_token`.
- Por defecto no se guardan tokens en la cookie. Con `storeTokens: true` se
  guardan `accessToken` y `refreshToken` (y `logout` revoca el refresh token).
- `returnTo` solo acepta rutas relativas del mismo sitio. Los errores
  redirigen a `errorPath` (por defecto `/`) con `?error=<código>`.
- `getSession` acepta un `Request`, `Headers`, el header `Cookie` o el
  `cookies()` de Next.

## 4. Express

```ts
import { requireMiRotaractUser } from "@mirotaract/sdk/express";

// API que recibe el access token de una SPA/app móvil (app PUBLIC):
app.get("/api/yo", requireMiRotaractUser({ auth }), (req, res) => {
  res.json(req.miRotaract.user);
});
```

- `verify: "userinfo"` (por defecto): consulta `/oauth/userinfo`, así que un
  consentimiento revocado, una app suspendida o una cuenta deshabilitada se
  rechazan en el acto. Cachea el resultado `cacheTtlSec` (60 s).
- `verify: "jwt"`: verificación local de la firma (sin red por pedido), pero no
  ve revocaciones hasta que el token vence (10 min).
- `authorize: (user) => boolean`: chequeo extra (por ejemplo, membresía en un
  club); `false` responde 403.

**Recomendado para apps web clásicas: sesión del lado del servidor.** Hacé el
login con `auth.authorizationUrl` / `auth.exchangeCode`, guardá
`tokens.claims` en tu sesión (`express-session`, Redis…) y protegé las rutas
con:

```ts
app.use("/panel", requireMiRotaractUser({ source: "session", getUser: (req) => req.session.miRotaractUser }));
```

Sin token o con token inválido responde `401 { error: "invalid_token" }` con
`WWW-Authenticate: Bearer error="invalid_token"`.

## 5. Webhooks

Mi Rotaract le avisa a tu servidor cuando pasa algo (socio activado, baja,
cargo asumido...) con un `POST` firmado. Guía completa:
[docs/developers/webhooks.md](../../docs/developers/webhooks.md); tipos:
[catálogo de eventos](../../docs/developers/catalogo-de-eventos.md).

`verifyWebhook` comprueba la firma (`MiRotaract-Signature`, HMAC-SHA256 con
marca de tiempo, tolerancia 300 s) y devuelve el evento tipado. Necesita el
**cuerpo crudo**:

```ts
import { verifyWebhook, MiRotaractWebhookError } from "@mirotaract/sdk";

const event = await verifyWebhook({
  payload: rawBody, // string | Uint8Array | ArrayBuffer
  headers: req.headers, // Headers o un objeto (mayúsculas indistintas)
  secret: process.env.MIROTARACT_WEBHOOK_SECRET!, // o [nuevo, viejo]
  toleranceSec: 300,
});
if (event.type === "membership.activated.v1")
  console.log(event.data.membership.person.displayName);
```

Si no es válido lanza `MiRotaractWebhookError` con `code`:
`missing_header`, `invalid_timestamp`, `timestamp_out_of_tolerance`,
`invalid_signature` o `invalid_payload`.

**Next.js / fetch** (`Request` → `Response`; también desde la raíz del
paquete):

```ts
// app/api/webhooks/mirotaract/route.ts
import { createWebhookHandler } from "@mirotaract/sdk/next";

export const POST = createWebhookHandler({
  secret: process.env.MIROTARACT_WEBHOOK_SECRET!,
  onEvent: async (event) => {
    /* deduplicá por event.id */
  },
}); // 200 · 400 firma inválida · 500 si onEvent lanza (se reintenta)
```

**Express**:

```ts
import express from "express";
import { miRotaractWebhook } from "@mirotaract/sdk/express";

app.post(
  "/api/webhooks/mirotaract",
  express.raw({ type: "application/json" }),
  miRotaractWebhook({ secret: process.env.MIROTARACT_WEBHOOK_SECRET! }),
  (req, res) => {
    handle(req.miRotaractEvent);
    res.sendStatus(200);
  },
);
```

Tipos exportados: `MiRotaractWebhookEvent` (unión de todo el catálogo v1),
`MembershipActivatedEvent`, `MembershipEndedEvent`,
`AppointmentActivatedEvent`, `AppointmentEndedEvent`,
`OrganizationUpdatedEvent`, `OrganizationArchivedEvent`,
`PersonUpdatedEvent`, `PeriodCreatedEvent`, `PingEvent`, `MiRotaractEvent`.

## Conformidad

`sdks/conformance/run-js.mjs` ejecuta los escenarios de
`sdks/conformance/scenarios.json` contra un kernel real descartable (el
escenario `webhooks.signature_vectors` corre sin kernel, con
`sdks/conformance/webhook-vectors.json`):

```bash
pnpm --filter @mirotaract/sdk build
KERNEL_DATABASE_URL=… MR_BASE_URL=http://127.0.0.1:3911/api/kernel/v1 node sdks/conformance/seed.mjs > /tmp/mr.env
node --env-file=/tmp/mr.env sdks/conformance/run-js.mjs
```

## Desarrollo

```bash
pnpm --filter @mirotaract/sdk test       # node --test (sin red, fetch falso)
pnpm --filter @mirotaract/sdk build      # dist/esm + dist/cjs + tipos
```

El paquete está marcado `private` hasta que se decida publicarlo en npm
(evita que el flujo de release del design system lo publique por accidente).
