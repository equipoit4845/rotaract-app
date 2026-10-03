# Errores

El kernel usa tres formatos de error según la ruta. Tu código tiene que
distinguirlos.

| Rutas | Formato | Content-Type |
|---|---|---|
| `/service/*`, `/developer/*`, `/oauth/authorize/context`, `/oauth/authorize`, `/oauth/consents*` y el resto de la API | Problem Details (RFC 9457) | `application/problem+json` |
| `/oauth/token`, `/oauth/revoke` | Error OAuth (RFC 6749 §5.2) | `application/json` |
| `/oauth/userinfo` | Error de bearer token (RFC 6750 §3.1) | `application/json` + `WWW-Authenticate` |
| Vuelta a tu `redirect_uri` | Parámetro `error` en la URL | — |

## Problem Details

```json
{
  "type": "https://api.rotaract4845.com/errors/kernel_http_403",
  "title": "Request failed",
  "status": 403,
  "code": "KERNEL_HTTP_403",
  "detail": "Fuera del alcance de esta app",
  "instance": "/api/kernel/v1/service/organizations/cmb0c2encsur00000000002",
  "traceId": "app-asistencia-7f3a9b2c"
}
```

| Campo | Para qué |
|---|---|
| `status` | El código HTTP. |
| `code` | Código estable para tu lógica: por ejemplo `KERNEL_INVALID_TRANSITION`, o `KERNEL_HTTP_<status>` para errores genéricos. |
| `detail` | Explicación legible. Útil para logs; no la uses para decidir (puede cambiar de redacción). |
| `instance` | La ruta que falló. |
| `traceId` | Identificador del pedido. Viene **siempre**: el trace-id de tu `traceparent` (32 caracteres hexadecimales), si no tu `X-Correlation-Id`, si no uno generado. También llega en la cabecera `X-Trace-Id` de toda respuesta, incluso las exitosas. |

**Consejo:** mandá un `X-Correlation-Id` propio en cada pedido y logealo.
Con ese valor encontrás el pedido en la pestaña **Registros** de tu app en la
consola (`/developer/apps/<app>` → Registros, filtro por traceId), con su
ruta, su resultado y su demora. Si tenés que reportar un problema al
distrito, mandá ese valor.

## Error OAuth

```json
{ "error": "invalid_grant", "error_description": "Invalid authorization code" }
```

`error_description` es opcional. Las respuestas `401` traen
`WWW-Authenticate: Basic realm="mirotaract"`; todas traen
`Cache-Control: no-store`.

En `/oauth/userinfo` el error es siempre:

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer error="invalid_token"

{ "error": "invalid_token" }
```

## Tabla de códigos

### HTTP

| HTTP | Significa | Qué hacer | ¿Reintentar? |
|---|---|---|---|
| `400` | Pedido inválido (parámetro mal formado, validación). | Corregí el pedido. Leé `detail`. | No |
| `401` | Sin credencial o credencial inválida (token vencido, app pausada). | En `/service/*`: pedí un token nuevo y reintentá **una vez**. En `/oauth/token`: revisá las credenciales. | Una vez, con token nuevo |
| `403` | Autenticado pero sin permiso: falta un scope o el recurso está fuera del alcance de tu app. | No es transitorio. Revisá scopes y organización. | No |
| `404` | No existe (o no es visible). | | No |
| `409` | Transición de estado inválida, o `Idempotency-Key` reutilizada con otro cuerpo. | Releé el estado actual. | No |
| `429` | Demasiados pedidos. Límites actuales por cliente y por minuto: 120 en general, 10 en login, 5 en registro, recuperación de contraseña e invitaciones. | Esperá lo que diga `Retry-After`. | Sí, respetando `Retry-After` |
| `500` | Error interno. | Reportalo con el `traceId`. | Con cuidado (backoff) |
| `502`, `503`, `504` | Infraestructura momentáneamente no disponible. | | Sí, con backoff |

### OAuth (`error`)

| `error` | Dónde | Causa típica | Qué hacer |
|---|---|---|---|
| `invalid_request` | token | Falta un parámetro (`grant_type`, `code`, `redirect_uri`, `code_verifier`, `refresh_token`). | Corregí el pedido. |
| `invalid_client` (401) | token, revoke | Credenciales incorrectas, secreto revocado o vencido, app pausada o revocada, app `PUBLIC` que mandó secreto. | Revisá la configuración. No reintentes en bucle: con credenciales malas nunca va a funcionar. |
| `invalid_grant` | token | Código vencido, usado o con `code_verifier`/`redirect_uri` incorrectos; refresh token inválido, revocado o reusado; la persona quitó el acceso; cuenta no activa. | Empezá el ingreso de nuevo. |
| `invalid_scope` | token | Scope no otorgado a la app (o, en refresh, fuera del original). | Pedí solo lo otorgado. |
| `unauthorized_client` | token | La app no tiene habilitado ese `grant_type`. | Pedile al RDR otra app con ese acceso. |
| `unsupported_grant_type` | token | `grant_type` desconocido. | Usá `client_credentials`, `authorization_code` o `refresh_token`. |
| `invalid_token` (401) | userinfo | Access token ausente, vencido, de otro tipo, o acceso revocado. | Refrescá; si falla, que la persona vuelva a ingresar. |
| `access_denied` | redirect | La persona canceló en el consentimiento. | Mensaje amable. No es un error de tu app. |

Los errores de validación del pedido de autorización (por ejemplo,
`redirect_uri` no registrada) **no vuelven a tu app**: Mi Rotaract los
muestra en su propia página. Si tus usuarios te reportan "La dirección de
retorno (redirect_uri) no está registrada para esta app", revisá que la URL
que mandás sea idéntica a la registrada.

## Reintentos

Reintentá solo lo que puede fallar por algo transitorio y solo lo que es
seguro repetir.

**Seguros de reintentar:**

- Todos los `GET` de `/service/*`.
- `POST /service/persons/batch`, `POST /service/authorization/check` y
  `POST /service/authorization/batch-check`: son consultas, no modifican
  nada.
- `POST /oauth/token` con `client_credentials`.

**No reintentes a ciegas:**

- **Canje de código** (`authorization_code`): el código es de un solo uso.
  Si la respuesta se perdió, el código ya puede estar consumido; empezá el
  ingreso de nuevo.
- **Refresh** (`refresh_token`): si el kernel procesó el pedido pero la
  respuesta se perdió, el token viejo ya rotó; reenviarlo cuenta como
  **reuso** y revoca todas las sesiones de esa persona con tu app. Ante un
  error de red en un refresh, lo más seguro es pedirle a la persona que
  vuelva a ingresar.

**Cómo:**

- Backoff exponencial con algo de azar (por ejemplo 0,5 s, 1 s, 2 s, 4 s
  ± 20 %), máximo 3 a 5 intentos.
- Si viene `Retry-After` (segundos o una fecha HTTP), esperá **al menos**
  eso.
- Nunca reintentes `400`, `403`, `404` ni `409`.

```ts
async function withRetry(call: () => Promise<Response>, attempts = 4): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const response = await call();
    const transient = [429, 502, 503, 504].includes(response.status);
    if (!transient || attempt === attempts) return response;
    const retryAfter = Number(response.headers.get("retry-after"));
    const backoff = 500 * 2 ** (attempt - 1) * (0.8 + Math.random() * 0.4);
    await new Promise((r) => setTimeout(r, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoff));
  }
}
```

Los SDKs oficiales (`@mirotaract/sdk` y `mirotaract`, todavía no publicados
en npm/PyPI; ver [README.md](README.md#sdks-oficiales)) ya hacen esto: hasta
2 reintentos por defecto, con backoff exponencial y azar, ante
`429`/`502`/`503`/`504` y errores de red, respetando `Retry-After` (si la
espera pedida supera el máximo configurado, 30 s por defecto, devuelven el
error en vez de esperar). Reintentan `GET`, `PUT` y `DELETE`, y **nunca** un
`POST` sin `Idempotency-Key`. Las consultas por `POST`
(`persons.batch`, `permissions.check` y `permissions.checkMany` /
`check_many`) mandan una `Idempotency-Key` generada por el SDK, así que sí
se reintentan. El pedido del token (`POST /oauth/token`), el canje de código
y el refresh **no** se reintentan.

Errores tipados de los SDKs:

| Clase | Cuándo | Campos (JS / Python) |
|---|---|---|
| `MiRotaractApiError` | La API respondió Problem Details. | `status`, `code`, `title`, `detail`, `traceId` / `trace_id`, `type`, `instance`, `body` |
| `MiRotaractOAuthError` | Un endpoint `/oauth/*` respondió un error OAuth, un token no pasó la verificación local (`invalid_token`) o el callback trajo `error=…`. | `error`, `errorDescription` / `error_description`, `status` (vacío en verificaciones locales) |
| `MiRotaractConfigError` | Configuración inválida (por ejemplo, un `clientSecret` en el navegador). | — |

Las tres heredan de `MiRotaractError`, que también se usa para errores de
red cuando se agotan los reintentos.

```ts
import { MiRotaractApiError, MiRotaractOAuthError } from "@mirotaract/sdk";

try {
  await client.members.list(otroClubId).all();
} catch (error) {
  if (error instanceof MiRotaractApiError) {
    console.error(error.status, error.code, error.detail, error.traceId); // 403 KERNEL_HTTP_403 "Fuera del alcance de esta app"
  } else if (error instanceof MiRotaractOAuthError) {
    console.error(error.error, error.errorDescription); // "invalid_client", …
  } else throw error;
}
```

```python
from mirotaract import MiRotaractApiError, MiRotaractOAuthError

try:
    client.members.list(otro_club_id).all()
except MiRotaractApiError as e:
    print(e.status, e.code, e.detail, e.trace_id)
except MiRotaractOAuthError as e:
    print(e.error, e.error_description)
```

## Idempotencia

Las operaciones del kernel que **crean o cambian** algo (`POST` y `PATCH` de
comandos, como las de la consola de apps) exigen el encabezado
`Idempotency-Key`:

- Mandá un valor único por operación (un UUID).
- Si reintentás con la **misma clave y el mismo cuerpo**, recibís la
  respuesta original sin que la operación se ejecute dos veces.
- La misma clave con **otro cuerpo** da `409` y no ejecuta nada.

Excepción por seguridad: los secretos nunca se vuelven a mostrar. Repetir el
alta de una app con la misma clave devuelve la app con `clientSecret: null`,
y repetir una rotación de secreto da `409` ("Ese secreto ya se entregó una
vez…"). Si perdiste el secreto, creá uno nuevo.

La API de datos (`/service/*`) es de solo lectura, así que tu app de comité
normalmente no necesita `Idempotency-Key`.
