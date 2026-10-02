# Autenticación de servidor (`client_credentials`)

Para apps de servidor (`CONFIDENTIAL`) que consultan datos del club o del
distrito **por su cuenta**, sin que ninguna persona inicie sesión. Tu app
canjea su `client_id` y su secreto por un **token de servicio** y lo usa para
llamar a los endpoints `/service/*`.

Requisitos: una app de tipo Servidor con el acceso "Acceso propio de la app a
datos del distrito" y al menos un scope `kernel.service.*` (ver
[registrar-una-app.md](registrar-una-app.md)).

```text
API = https://api.rotaract4845.com/api/kernel/v1
```

Guardá las credenciales en variables de entorno o en un gestor de secretos,
nunca en el código ni en el repositorio:

```bash
MIROTARACT_CLIENT_ID=mra_3f9c2a7b1e4d8c6a0b5f
MIROTARACT_CLIENT_SECRET=mrs_...   # el que te entregó el RDR
```

## 1. Pedir el token

`POST {API}/oauth/token` con `grant_type=client_credentials`. El cuerpo puede
ir como `application/x-www-form-urlencoded` (lo habitual en OAuth) o como
JSON. La app se autentica de una de estas dos formas:

### Con HTTP Basic (`client_secret_basic`, recomendada)

```bash
curl -s -X POST "$API/oauth/token" \
  -u "$MIROTARACT_CLIENT_ID:$MIROTARACT_CLIENT_SECRET" \
  -d grant_type=client_credentials
```

El encabezado es `Authorization: Basic base64(client_id:client_secret)`, con
cada parte codificada como `application/x-www-form-urlencoded` antes de unir
(RFC 6749 §2.3.1). Nuestros `client_id` y secretos no tienen caracteres que
cambien al codificarse, pero las librerías OAuth lo hacen igual.

### Con las credenciales en el cuerpo (`client_secret_post`)

```bash
curl -s -X POST "$API/oauth/token" \
  -d grant_type=client_credentials \
  -d client_id="$MIROTARACT_CLIENT_ID" \
  -d client_secret="$MIROTARACT_CLIENT_SECRET"
```

### Pedir menos scopes

Sin `scope`, el token trae **todos** los scopes de servicio de la app. Podés
pedir un subconjunto (separado por espacios) para que un proceso tenga solo
lo que usa:

```bash
curl -s -X POST "$API/oauth/token" \
  -u "$MIROTARACT_CLIENT_ID:$MIROTARACT_CLIENT_SECRET" \
  -d grant_type=client_credentials \
  --data-urlencode "scope=kernel.service.organizations.read kernel.service.memberships.read"
```

Pedir un scope que la app no tiene da `invalid_scope`.

### Respuesta

```http
HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: no-store

{
  "access_token": "eyJhbGciOiJFUzI1NiIsImtpZCI6Ii4uLiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 600,
  "scope": "kernel.service.organizations.read kernel.service.memberships.read"
}
```

No hay `refresh_token` en este flujo: cuando el token vence, pedís otro con
las mismas credenciales.

## 2. Usar el token

```bash
curl -s "$API/service/organizations/cmb0c1asucentro000000001" \
  -H "Authorization: Bearer $TOKEN"
```

El token solo sirve para las rutas `/service/*` (y `POST /auth/introspect`
con su scope). La referencia de endpoints está en
[api-de-datos.md](api-de-datos.md).

## Cómo es el token

Es un JWT firmado con **ES256** (curva elíptica P-256). Decodificado:

```json
// header
{ "alg": "ES256", "kid": "k_2026_09", "typ": "JWT" }

// payload
{
  "iss": "https://api.rotaract4845.com/api/kernel/v1",
  "aud": "institutional-kernel",
  "sub": "app:mra_3f9c2a7b1e4d8c6a0b5f",
  "client_id": "mra_3f9c2a7b1e4d8c6a0b5f",
  "azp": "mra_3f9c2a7b1e4d8c6a0b5f",
  "token_use": "service",
  "scope": "kernel.service.organizations.read kernel.service.memberships.read",
  "org": "cmb0c1asucentro000000001",
  "iat": 1790000000,
  "exp": 1790000600,
  "jti": "5b0f6a3e-2c1d-4f7a-9e8b-1a2b3c4d5e6f"
}
```

| Claim | Significado |
|---|---|
| `iss` | Emisor: la URL base de la API. |
| `aud` | Siempre `institutional-kernel`: el token es **para el kernel**, no para tu API. |
| `sub` | `app:<client_id>`. |
| `client_id`, `azp` | Tu `client_id`. |
| `token_use` | `service` (un token de usuario dice `user` y no sirve para `/service/*`). |
| `scope` | Scopes de servicio otorgados, separados por espacio. |
| `org` | La organización de tu app: el alcance es `org` y sus descendientes. |
| `exp` | `iat + 600`: 10 minutos. |

### ¿Tengo que verificarlo?

No es necesario: quien lo verifica es el kernel en cada llamada. Tu app lo
trata como un valor opaco. Si querés inspeccionarlo (por ejemplo, para
loguear qué scopes recibiste), podés verificarlo contra las claves públicas:

```ts
import { createRemoteJWKSet, jwtVerify } from "jose";

const ISSUER = "https://api.rotaract4845.com/api/kernel/v1";
const jwks = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`));

const { payload } = await jwtVerify(accessToken, jwks, {
  issuer: ISSUER,
  audience: "institutional-kernel",
  algorithms: ["ES256"],
});
console.log(payload.scope, payload.org);
```

**No uses estos tokens para autenticar llamadas a tu propia API.** Su
audiencia es el kernel. Si necesitás identificar personas en tu app, usá
[Ingresar con Mi Rotaract](ingresar-con-mi-rotaract.md).

El JWKS incluye la clave activa y las retiradas en los últimos 30 días, así
que un token firmado justo antes de una rotación de claves sigue verificando.
Las librerías como `jose` cachean el JWKS y lo vuelven a pedir cuando ven un
`kid` desconocido.

## Cachear el token

Pedir un token por cada llamada es lento e innecesario. Guardalo en memoria
y renovalo poco antes de que venza:

```ts
let cached: { token: string; expiresAt: number } | undefined;

export async function serviceToken(): Promise<string> {
  // renovamos 60 s antes del vencimiento
  if (cached && Date.now() < cached.expiresAt - 60_000) return cached.token;

  const response = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: {
      authorization:
        "Basic " +
        Buffer.from(
          `${process.env.MIROTARACT_CLIENT_ID}:${process.env.MIROTARACT_CLIENT_SECRET}`,
        ).toString("base64"),
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`${body.error}: ${body.error_description ?? ""}`);

  cached = { token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return cached.token;
}
```

```python
import os, time, httpx

API = "https://api.rotaract4845.com/api/kernel/v1"
_cached: dict | None = None

def service_token() -> str:
    global _cached
    if _cached and time.time() < _cached["expires_at"] - 60:
        return _cached["token"]
    response = httpx.post(
        f"{API}/oauth/token",
        auth=(os.environ["MIROTARACT_CLIENT_ID"], os.environ["MIROTARACT_CLIENT_SECRET"]),
        data={"grant_type": "client_credentials"},
    )
    body = response.json()
    if response.status_code != 200:
        raise RuntimeError(f"{body['error']}: {body.get('error_description', '')}")
    _cached = {"token": body["access_token"], "expires_at": time.time() + body["expires_in"]}
    return _cached["token"]
```

Si una llamada a `/service/*` responde `401` con un token que creías vigente
(por ejemplo, el reloj de tu servidor está corrido), descartá el token
cacheado, pedí uno nuevo y reintentá **una sola vez**.

## Con los SDKs oficiales

> **SDKs todavía no publicados.** `@mirotaract/sdk` (JavaScript/TypeScript,
> Node 20+) y `mirotaract` (Python ≥ 3.10) ya existen en el monorepo
> (`packages/sdk-js` y `sdks/python`), pero no están en npm ni en PyPI.
> Mientras tanto, instalalos desde el repositorio (ver
> [README.md](README.md#sdks-oficiales)).

Los SDKs piden el token con `client_credentials`, lo cachean y lo renuevan
60 s antes del vencimiento (si hay pedidos concurrentes, comparten una sola
renovación). Si `/service/*` responde `401` con el token cacheado, lo
descartan, piden uno nuevo y reintentan una vez. Además siguen la paginación
y reintentan con backoff ante `429`/`502`/`503`/`504` y errores de red (ver
[errores.md](errores.md#reintentos)).

```ts
import { MiRotaract } from "@mirotaract/sdk";

const client = new MiRotaract({
  baseUrl: "https://api.rotaract4845.com/api/kernel/v1",
  clientId: process.env.MIROTARACT_CLIENT_ID!,
  clientSecret: process.env.MIROTARACT_CLIENT_SECRET!,
  // scope: ["kernel.service.memberships.read"], // opcional; por defecto, todos los de la app
});

for await (const member of client.members.list(process.env.ORGANIZATION_ID!, { status: "ACTIVE" })) {
  console.log(member.person.displayName);
}

client.grantedScopes; // scopes del token vigente (después de la primera llamada)
```

```python
import os
from mirotaract import MiRotaract

client = MiRotaract(
    "https://api.rotaract4845.com/api/kernel/v1",
    os.environ["MIROTARACT_CLIENT_ID"],
    os.environ["MIROTARACT_CLIENT_SECRET"],
    # scope=["kernel.service.memberships.read"],  # opcional
)

for member in client.members.list(os.environ["ORGANIZATION_ID"], status="ACTIVE"):
    print(member["person"]["displayName"])  # las vistas son dicts con las claves de la API

client.granted_scopes
```

En Python también está `AsyncMiRotaract`, con la misma superficie y
`async for` / `await`. Si necesitás el token crudo (por ejemplo, para una
ruta que el SDK todavía no envuelve), usá `client.getAccessToken()` /
`client.get_access_token()` o directamente `client.request(...)`.

## Errores

### Al pedir el token (`/oauth/token`)

Formato OAuth (RFC 6749 §5.2), **no** Problem Details:

```json
{ "error": "invalid_client" }
```

| HTTP | `error` | Causa | Qué hacer |
|---|---|---|---|
| 401 | `invalid_client` | `client_id` o secreto incorrectos, secreto revocado o vencido, app pausada o revocada. Siempre el mismo error, para no revelar si el `client_id` existe. | Revisá las variables de entorno. Si rotaron el secreto, usá el nuevo. Si la app está pausada, hablá con el RDR. No reintentes en bucle. |
| 400 | `invalid_scope` | Pediste un `scope` que la app no tiene. | Pedí solo scopes otorgados, o pedile al RDR que los agregue. |
| 400 | `unauthorized_client` | La app no tiene habilitado `client_credentials` (por ejemplo, es `PUBLIC`). | La app tiene que ser de servidor con acceso propio. |
| 400 | `unsupported_grant_type` | `grant_type` desconocido. | Usá `client_credentials`. |
| 400 | `invalid_request` | Falta `grant_type`. | Revisá el cuerpo del pedido. |

La respuesta `401` incluye `WWW-Authenticate: Basic realm="mirotaract"`.

### Al llamar a `/service/*`

Formato Problem Details (`application/problem+json`):

```json
{
  "type": "https://api.rotaract4845.com/errors/kernel_http_403",
  "title": "Request failed",
  "status": 403,
  "code": "KERNEL_HTTP_403",
  "detail": "Fuera del alcance de esta app",
  "instance": "/api/kernel/v1/service/organizations/cmb0c2encsur00000000002"
}
```

| HTTP | `detail` | Causa | Qué hacer |
|---|---|---|---|
| 401 | `Service credential required` | No mandaste `Authorization: Bearer`. | Agregá el token. |
| 401 | `Invalid service token` | Token vencido, mal firmado, de usuario (`token_use: user`) o una sesión de la plataforma. | Pedí un token nuevo con `client_credentials`. |
| 401 | `Service app is not active` | La app fue pausada o revocada después de emitir el token. | Hablá con el RDR. |
| 403 | `Service credential is missing required scope: <scope>` | El token no tiene el scope del endpoint. | Pedí el scope al RDR (o no lo excluyas al pedir el token). |
| 403 | `Fuera del alcance de esta app` | La organización, persona o cuenta está fuera de la organización de tu app y sus descendientes. | Es correcto: tu app no debe ver eso. |

Más detalle en [errores.md](errores.md).
