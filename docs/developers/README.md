# Mi Rotaract para desarrolladores

Documentación para los equipos de desarrollo de los comités del Distrito
Rotaract 4845 (Paraguay) que quieren construir apps conectadas a Mi Rotaract.

Mi Rotaract tiene un **Kernel Institucional**: el sistema que sabe quién es
quién en el distrito (personas, clubes, membresías, períodos, cargos y
autoridades). Es la **única fuente de verdad**. Tu app no copia ni corrige
esos datos por su cuenta: los consulta al kernel, a través de su API, cuando
los necesita.

## En 5 minutos

### Qué podés construir

- Una app de asistencia para las reuniones de tu club que lee el padrón de
  socios.
- Un tablero distrital que muestra las autoridades vigentes de cada club.
- Una app de inscripción a un evento donde la gente entra con su cuenta de
  Mi Rotaract, sin crear otro usuario y otra contraseña.
- Un bot o una planilla que sincroniza, cada noche, los cambios del padrón.
- Una app que se entera al instante de altas, bajas y cambios de autoridades
  por [webhooks](webhooks.md), sin consultar al kernel cada tanto.

### Dos maneras de integrarte

| | App de servidor (credenciales propias) | "Ingresar con Mi Rotaract" |
|---|---|---|
| Para qué | Tu servidor consulta datos del club o del distrito por su cuenta, sin que nadie inicie sesión. | Las personas inician sesión en tu app con su cuenta de Mi Rotaract. |
| Estándar | OAuth 2.0 `client_credentials` | OAuth 2.0 authorization code + PKCE, OpenID Connect |
| Qué recibís | Un token de servicio (vale 10 minutos) para llamar a `/service/*` | Un `id_token` con los datos de la persona que ella aceptó compartir |
| Quién decide qué datos | El distrito, al registrar la app | La persona, en la pantalla de consentimiento (dentro de lo que el distrito habilitó) |
| Guía | [autenticacion-servidor.md](autenticacion-servidor.md) | [ingresar-con-mi-rotaract.md](ingresar-con-mi-rotaract.md) |

Una misma app de servidor puede hacer las dos cosas.

> **OAuth** es el estándar para que una app obtenga permiso de acceso sin
> conocer la contraseña de nadie. **OpenID Connect (OIDC)** lo extiende para
> el inicio de sesión. Un **token** es una credencial temporal; los nuestros
> son **JWT** (JSON firmados digitalmente) que podés verificar. Un **scope**
> es un permiso puntual, por ejemplo "leer el padrón de socios".

### Cómo pedir una app al distrito

Las apps no se registran solas: las da de alta el **Representante Distrital
(RDR)** en la consola de apps de Mi Rotaract
(`https://app.rotaract4845.com/developer/apps`). Para pedir una, mandale al
RDR:

1. **Nombre** de la app y una **descripción** corta (la ven las personas en
   la pantalla de consentimiento).
2. **Organización**: ¿es de un club o del distrito? Una app de club solo ve
   ese club.
3. **Tipo**: servidor (puede guardar un secreto) o web/móvil (no puede).
4. **Qué necesita hacer**: consultar datos por su cuenta, que las personas
   ingresen con Mi Rotaract, o ambas.
5. **Qué datos necesita, y por qué**. Pedí lo mínimo (ver
   [conceptos.md](conceptos.md#scopes)).
6. **Direcciones de regreso** (redirect URIs), si las personas van a
   ingresar con Mi Rotaract.

El RDR te entrega el `client_id` y, si la app es de servidor, el secreto. El
paso a paso de la consola está en [registrar-una-app.md](registrar-una-app.md).

### Tu primera llamada

```bash
API=https://api.rotaract4845.com/api/kernel/v1

# 1. Pedí un token de servicio con las credenciales de tu app
TOKEN=$(curl -s -u "$MIROTARACT_CLIENT_ID:$MIROTARACT_CLIENT_SECRET" \
  -d grant_type=client_credentials \
  "$API/oauth/token" | jq -r .access_token)

# 2. Leé la organización de tu app
curl -s -H "Authorization: Bearer $TOKEN" \
  "$API/service/organizations/$ORGANIZATION_ID" | jq
```

> **¿No programás?** [Creá tu app con IA](crear-con-ia.md): describís la
> idea, copiás un prompt y tu asistente de código (Claude Code, Cursor,
> Copilot) la construye con las herramientas oficiales.

## Empezar en 15 minutos (sin datos reales)

```bash
mirotaract init mi-app --template next --kernel-repo ~/rotaract-app   # o fastapi / flutter
cd mi-app && npm install
mirotaract dev up --kernel-repo ~/rotaract-app   # kernel local + Distrito 9999 (sandbox) + .env.local
npm run dev                                      # entrá con socio.norte@example.org / sandbox-9999
```

La CLI levanta un kernel local en Docker con un distrito sintético, registra
una app de prueba y escribe sus credenciales en `.env.local`. Además genera
tipos (`mirotaract gen types`) y reenvía webhooks a tu servidor local
(`mirotaract webhooks listen`). Guía completa: [cli.md](cli.md).

## Guías

| Documento | Contenido |
|---|---|
| [crear-con-ia.md](crear-con-ia.md) | Crear una app con IA, sin ser desarrollador: describís la idea, copiás un prompt y tu asistente de código la construye ([versión interactiva](https://developers.rotaract4845.com/ia)). |
| [quickstart-nextjs.md](quickstart-nextjs.md) | Quickstart Next.js: login y padrón en 15 minutos (código probado en CI). |
| [quickstart-express.md](quickstart-express.md) | Quickstart Express: API que verifica el token de tu app móvil, padrón y webhooks. |
| [quickstart-fastapi.md](quickstart-fastapi.md) | Quickstart FastAPI: login con sesión del lado del servidor y padrón. |
| [quickstart-flutter.md](quickstart-flutter.md) | Quickstart Flutter: app móvil `PUBLIC` con PKCE y padrón vía tu backend. |
| [cli.md](cli.md) | CLI `mirotaract`: plantillas (Next.js, FastAPI, Flutter), kernel local con datos sintéticos, tipos y webhooks en local. |
| [conceptos.md](conceptos.md) | Organizaciones, personas, membresías, períodos, cargos; apps, tipos, alcance, scopes y consentimiento. |
| [registrar-una-app.md](registrar-una-app.md) | Para el RDR: alta de una app en la consola, secretos, rotación, pausa y revocación. |
| [autenticacion-servidor.md](autenticacion-servidor.md) | `client_credentials`: pedir, verificar y cachear el token de servicio. |
| [ingresar-con-mi-rotaract.md](ingresar-con-mi-rotaract.md) | Inicio de sesión con OIDC + PKCE, `id_token`, userinfo, refresh y revocación. |
| [api-de-datos.md](api-de-datos.md) | Referencia de los endpoints `/service/*`: paginación, sincronización incremental, ETag. |
| [webhooks.md](webhooks.md) | Recibir avisos firmados cuando cambia algo (altas, bajas, cargos): verificar la firma en JS/Python, reintentos, idempotencia. |
| [catalogo-de-eventos.md](catalogo-de-eventos.md) | Todos los tipos de evento, con sus campos y un ejemplo (generado del contrato). |
| [modulos.md](modulos.md) | Publicar tu app como módulo: manifiesto, permisos propios que el RDR asigna a cargos, instalación y configuración por club. |
| [kit-de-ui.md](kit-de-ui.md) | Kit de UI: los componentes de Mi Rotaract con `npx shadcn add` (tema, shell, tablas, badges de estado, diálogo de confirmación). |
| [errores.md](errores.md) | Formatos de error, códigos y qué hacer con cada uno; reintentos. |
| [seguridad.md](seguridad.md) | Checklist obligatoria antes de pedir producción. |
| [ia.md](ia.md) | Programar con asistentes de IA: skills para Claude Code, Cursor, Copilot y AGENTS.md, servidor MCP, llms.txt, plantillas de prompt y evals. |
| [faq.md](faq.md) | Preguntas frecuentes. |
| [changelog.md](changelog.md) | Cambios de la API, los SDKs y la CLI, con su impacto en compatibilidad. |
| [deprecaciones.md](deprecaciones.md) | Política de deprecación: 6 meses de aviso, cabeceras `Deprecation`/`Sunset` y emails. |

## Datos de referencia

| Qué | Valor |
|---|---|
| API del kernel (y `issuer` OIDC) | `https://api.rotaract4845.com/api/kernel/v1` |
| Discovery OIDC | `https://api.rotaract4845.com/api/kernel/v1/.well-known/openid-configuration` |
| Claves públicas (JWKS) | `https://api.rotaract4845.com/api/kernel/v1/.well-known/jwks.json` |
| Pantalla de autorización | `https://app.rotaract4845.com/oauth/authorize` |
| Consola de apps (RDR) | `https://app.rotaract4845.com/developer/apps` |
| Apps conectadas (cada persona) | `https://app.rotaract4845.com/connected-apps` |
| Catálogo de eventos (JSON) | `https://api.rotaract4845.com/api/kernel/v1/events/catalog` |
| Contrato OpenAPI | `kernel-openapi.yaml`, tags `OAuth`, `DeveloperApps`, `Service`, `Webhooks` y `Events` |
| Portal para desarrolladores (guías, referencia, "Probar") | `https://developers.rotaract4845.com` ([diseño](../16-developer-portal.md)) |
| Registros de requests de tu app | Consola de apps → tu app → **Registros** (30 días; `GET /developer/apps/{appId}/request-logs`) |

## SDKs oficiales

Si tu app está en JavaScript/TypeScript o en Python, no hace falta que
escribas a mano el token, la paginación, los reintentos ni la verificación
del `id_token`: hay dos SDKs oficiales con la misma superficie.

| SDK | Lenguaje | Requisitos | Incluye | Documentación |
|---|---|---|---|---|
| `@mirotaract/sdk` | JavaScript/TypeScript (ESM y CommonJS, tipos incluidos) | Node 20+ (también runtimes edge y navegador, solo para el login con apps `PUBLIC`) | `MiRotaract` (API de datos), `MiRotaractAuth` (login), `requireMiRotaractUser` para Express (`@mirotaract/sdk/express`), `createMiRotaractNext` para Next.js App Router (`@mirotaract/sdk/next`) | [packages/sdk-js/README.md](../../packages/sdk-js/README.md) |
| `mirotaract` | Python | Python ≥ 3.10 (`httpx`, `PyJWT[crypto]`) | `MiRotaract` / `AsyncMiRotaract` (API de datos), `MiRotaractAuth` / `AsyncMiRotaractAuth` (login), `require_user` para FastAPI (`mirotaract.fastapi`) | [sdks/python/README.md](../../sdks/python/README.md) |

> **Instalación.** El SDK de JavaScript está publicado en npm con licencia MIT:
>
> ```bash
> npm install @mirotaract/sdk
> ```
>
> El SDK de Python todavía no está en PyPI. Mientras tanto, instalalo desde
> una copia del repositorio: `pip install /ruta/al/repo/sdks/python` (o
> `"/ruta/al/repo/sdks/python[fastapi]"`). Cuando se publique va a alcanzar con
> `pip install mirotaract`; el código de los ejemplos no cambia.

Superficie de la API de datos (cliente `MiRotaract`, solo servidor: usa el
secreto):

| Recurso | JavaScript | Python |
|---|---|---|
| `clubs` (alias `organizations`) | `list({ type, status, parentId, updatedSince, limit, ifNoneMatch })` → paginador, `get(id)` | `list(type=, status=, parent_id=, updated_since=, limit=, if_none_match=)` → paginador, `get(id)` |
| `members` | `list(organizationId, { status, updatedSince, limit, ifNoneMatch })` → paginador | `list(organization_id, status=, updated_since=, limit=, if_none_match=)` → paginador |
| `persons` | `get(id)`, `batch(ids)`, `memberships(personId)` | `get(id)`, `batch(ids)`, `memberships(person_id)` |
| `authorities` | `list(organizationId, { includeDescendants })` | `list(organization_id, include_descendants=)` |
| `periods` | `list(organizationId, { status })` | `list(organization_id, status=)` |
| `permissions` | `check({ personId, permission, organizationId, scopeType?, periodId?, resource? })`, `checkMany([...])` | `check(person_id=, permission=, organization_id=, scope_type=, period_id=, resource=)`, `check_many([...])` |
| Otros | `getAccessToken()`, `grantedScopes`, `clearToken()`, `discovery()`, `request({ method, path, query, json })` | `get_access_token()`, `granted_scopes`, `clear_token()`, `discovery()`, `request(method, path, params=, json=)` |

Los paginadores se recorren con `for await` / `for` (siguen `nextCursor`
solos) y tienen `.all({ max })` / `.all(max=)`, `.pages()` y
`.page(cursor?)`. En JS las respuestas son objetos tipados; en Python son
`dict` con las mismas claves que la API (`member["person"]["displayName"]`).

Login (`MiRotaractAuth`): `authorizationUrl()` / `authorization_url()`,
`parseCallback()` / `parse_callback()`, `exchangeCode()` / `exchange_code()`,
`refresh()`, `verifyIdToken()` / `verify_id_token()`,
`verifyAccessToken()` / `verify_access_token()`, `userInfo()` /
`user_info()`, `revoke()` y `discovery()`.

```ts
import { MiRotaract } from "@mirotaract/sdk";

const client = new MiRotaract({
  baseUrl: "https://api.rotaract4845.com/api/kernel/v1",
  clientId: process.env.MIROTARACT_CLIENT_ID!,
  clientSecret: process.env.MIROTARACT_CLIENT_SECRET!,
});
const club = await client.clubs.get(process.env.ORGANIZATION_ID!);
```

```python
import os
from mirotaract import MiRotaract

client = MiRotaract(
    "https://api.rotaract4845.com/api/kernel/v1",
    os.environ["MIROTARACT_CLIENT_ID"],
    os.environ["MIROTARACT_CLIENT_SECRET"],
)
club = client.clubs.get(os.environ["ORGANIZATION_ID"])
```

Dónde se usan en estas guías: token de servicio en
[autenticacion-servidor.md](autenticacion-servidor.md#con-los-sdks-oficiales),
paginación y ETag en [api-de-datos.md](api-de-datos.md#paginación-por-cursor),
login, Express, Next.js y FastAPI en
[ingresar-con-mi-rotaract.md](ingresar-con-mi-rotaract.md#ejemplos), errores
y reintentos en [errores.md](errores.md#reintentos).

Flutter, PHP, Kotlin, Swift, .NET y Go están planificados para una segunda
etapa.

## Lo que todavía no existe

Para que no lo busques: hoy **no** hay entorno sandbox **compartido** (sí hay
uno local: `mirotaract dev`, ver [cli.md](cli.md)), registro dinámico de clientes (las apps las registra el
RDR), cierre de sesión OIDC (`end_session`) ni consentimiento parcial (la
persona acepta o rechaza el pedido completo). Están planificados.

## Principios

- **El kernel es la fuente de verdad.** No mantengas un padrón paralelo que
  "corrija" el oficial; si un dato está mal, se corrige en Mi Rotaract.
- **Minimización de datos.** Pedí solo los scopes que usás, guardá solo lo
  que necesitás y por el tiempo que lo necesitás.
- **Nunca toques la base de datos.** Toda integración pasa por la API. No hay
  accesos directos, réplicas ni exportaciones por fuera de ella.
