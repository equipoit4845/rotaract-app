# CLI `mirotaract` y kernel local

Empezar una app conectada a Mi Rotaract es un comando, y se desarrolla **sin
conexión y sin datos reales**: la CLI levanta en tu máquina un kernel con un
distrito sintético (_Distrito 9999 (sandbox)_), registra una app de prueba y
te deja las credenciales en `.env.local`.

| Comando | Para qué |
|---|---|
| `mirotaract init [carpeta] --template next\|fastapi\|flutter` | App nueva con "Ingresar con Mi Rotaract", el padrón del club y `AGENTS.md`. |
| `mirotaract dev up\|down\|reset\|status` | Kernel local en Docker (API, web de login y base) con datos sintéticos. |
| `mirotaract gen types [--lang ts\|python]` | Tipos de la API (OpenAPI) y del catálogo de eventos. |
| `mirotaract webhooks listen --forward-to <url>` | Recibe los eventos de tu app y los reenvía, firmados, a tu servidor local. |

`mirotaract --help` y `mirotaract <comando> --help` muestran todas las
opciones.

## Primer login en 15 minutos

### 0. Requisitos (una vez)

- **Node 20+** y **Docker** con `docker compose` (v2).
- Una copia del repositorio del kernel (`rotaract-app`). Mientras la CLI,
  los SDKs y las imágenes no estén publicados, todo se instala desde ahí.
- Puertos libres: `54321` (API) y `54322` (web). Se cambian con
  `--api-port` / `--web-port`.

```bash
git clone <url-del-repo> ~/rotaract-app
cd ~/rotaract-app
npx pnpm@10.13.1 install
npx pnpm@10.13.1 --filter @mirotaract/sdk build     # SDK de JS (lo usa la plantilla next)
npm install -g ./packages/cli                        # deja el comando `mirotaract`
mirotaract --version
```

> Sin instalarla global: `node ~/rotaract-app/packages/cli/bin/mirotaract.js …`.
> Cuando se publique en npm alcanzará con `npx @mirotaract/cli …`.

### 1. Crear la app (1 minuto)

```bash
cd ~/proyectos
mirotaract init asistencia --template next --kernel-repo ~/rotaract-app
cd asistencia
npm install
```

`--kernel-repo` hace que el SDK se instale desde tu copia del repo
(`"@mirotaract/sdk": "file:…/packages/sdk-js"`). Podés usar
`MIROTARACT_KERNEL_REPO=~/rotaract-app` en vez de repetir la opción.

### 2. Levantar el kernel local (5–15 minutos la primera vez)

```bash
mirotaract dev up --kernel-repo ~/rotaract-app
```

La primera vez construye las imágenes de la API y de la web (varios minutos;
después usa la caché de Docker). Al terminar muestra algo así:

```
Kernel local (mirotaract-dev): corriendo

API del kernel / issuer: http://localhost:54321/api/kernel/v1
Web (login y consentimiento): http://localhost:54322
Documentación de la API: http://localhost:54321/docs

Distrito: Distrito 9999 (sandbox) (cmu…)
App local: client_id mra_… · id cmu…
App PUBLIC (móvil/SPA): client_id mra_…
Direcciones de regreso: http://localhost:3000/auth/callback, http://localhost:8000/auth/callback

Cuentas de prueba (contraseña para todas: sandbox-9999):
  admin@example.org                  Superadmin de la plataforma
  rdr@example.org                    Representante Distrital (RDR)
  secretaria.distrito@example.org    Secretaría distrital
  presidencia.norte@example.org      Presidencia de Sandbox Norte
  secretaria.norte@example.org       Secretaría de Sandbox Norte
  socio.norte@example.org            Socio/a de Sandbox Norte
  socio.sur@example.org              Socio/a de Sandbox Sur (otro club)

Credenciales escritas en /home/vos/proyectos/asistencia/.env.local
```

### 3. Ingresar (1 minuto)

```bash
npm run dev          # http://localhost:3000
```

Abrí `http://localhost:3000`, tocá **Ingresar con Mi Rotaract**, entrá con
`socio.norte@example.org` / `sandbox-9999`, aceptá los permisos y abrí
**Ver el padrón de mi club**. Probá con `socio.sur@example.org`: ve otro
club. Eso es todo.

Con FastAPI es igual:

```bash
mirotaract init padron-py --template fastapi --kernel-repo ~/rotaract-app
cd padron-py
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
mirotaract dev up --app-url http://localhost:8000
.venv/bin/uvicorn app.main:app --reload --port 8000
```

## `mirotaract dev`

| Subcomando | Qué hace |
|---|---|
| `dev up` | Construye (si pasás `--kernel-repo`) y levanta postgres, nats, la API y la web; migra, carga el seed base y el distrito sintético; registra la app local y escribe `.env.local`. Repetirlo es seguro (idempotente). |
| `dev status` | Estado de los contenedores, URLs, cuentas de prueba y contraseña. `--json` para scripts. |
| `dev down` | Detiene todo. **Los datos se conservan.** |
| `dev reset` | Borra la base y vuelve a levantar desde cero. |

Opciones de `dev up` (y `dev reset`):

| Opción | Por defecto | |
|---|---|---|
| `--kernel-repo <ruta>` | `MIROTARACT_KERNEL_REPO` | Checkout del kernel del que se construyen las imágenes. |
| `--api-port`, `--web-port` | `54321`, `54322` | Nunca 3000/3001/5432/6379. |
| `--app-url <url>` | `APP_URL` de `.env.local` o `http://localhost:3000` | Registra `<url>/auth/callback` en la app local. |
| `--redirect-uri <url>` | | Dirección de regreso extra (repetible; solo `localhost`). |
| `--env-file <archivo>` | `.env.local` | Dónde escribir las credenciales. |
| `--no-build` | | No reconstruir: usa las imágenes que ya existen (o `MIROTARACT_API_IMAGE` / `MIROTARACT_WEB_IMAGE`). |
| `--no-web` | | Solo la API (sin pantalla de login). |

**Qué escribe en `.env.local`** (los demás valores del archivo se respetan):

| Variable | Valor |
|---|---|
| `MIROTARACT_ISSUER`, `MIROTARACT_BASE_URL` | `http://localhost:54321/api/kernel/v1` |
| `MIROTARACT_WEB_URL` | `http://localhost:54322` |
| `MIROTARACT_CLIENT_ID`, `MIROTARACT_CLIENT_SECRET` | App local `CONFIDENTIAL` (`client_credentials` + `authorization_code`). **Cada `dev up` emite un secreto nuevo** y revoca el anterior. |
| `MIROTARACT_APP_ID` | Id interno de esa app (lo usa `webhooks listen`). |
| `MIROTARACT_PUBLIC_CLIENT_ID` | App `PUBLIC` de prueba (móvil/SPA), redirect `http://localhost:8765/callback`. |
| `MIROTARACT_ORGANIZATION_ID` | Id del distrito sintético (la organización de la app). |
| `APP_URL`, `SESSION_SECRET` | Solo si no estaban. |

El archivo queda con permisos `600`. Si tu `.gitignore` no lo ignora, la CLI
te avisa.

### El distrito sintético

`prisma/seed-synthetic.ts` del kernel: 6 clubes ("Rotaract Club Sandbox
Norte", "Sur", "Centro", "Lago", "Sierra", "Río"), 60 personas con nombres
obviamente ficticios (`Ana Ejemplo`, `Bruno Prueba`…) y correos
`@example.org`, el período rotario vigente (julio–junio) en el distrito y en
cada club, presidencia y secretaría en cada club, RDR y secretaría distrital,
algunas membresías de licencia o inactivas, y las cuentas de prueba de la
tabla de arriba. Todas las contraseñas son `sandbox-9999`.

El seed **se niega a correr** si la base tiene organizaciones o cuentas que
no son sintéticas (nunca toca datos reales). Ver
[14-cli-and-local-kernel.md](../14-cli-and-local-kernel.md).

### Si algo falla

| Síntoma | Qué hacer |
|---|---|
| `El puerto 54321 ya está en uso` | Otro programa lo usa: `--api-port 55321 --web-port 55322`. |
| `Falta el repositorio del kernel` | Pasá `--kernel-repo` (o `MIROTARACT_KERNEL_REPO`). |
| `Docker no está disponible` | Arrancá Docker y verificá `docker compose version`. |
| `invalid_client` en tu app | Corriste `dev up` desde otra carpeta y el secreto rotó: corré `dev up` en la carpeta de tu app. |
| El login vuelve con `redirect_uri` inválida | Tu app corre en otro puerto: `mirotaract dev up --app-url http://localhost:<puerto>`. |
| Logs | `docker compose -p mirotaract-dev logs -f api` (o `web`). |

## `mirotaract gen types`

```bash
mirotaract gen types                       # TypeScript → src/mirotaract-types.ts
mirotaract gen types --lang python         # TypedDicts → app/mirotaract_types.py
mirotaract gen types --out tipos.ts --base-url https://api.rotaract4845.com/api/kernel/v1
```

- **API**: el contrato OpenAPI que sirve el kernel en `/openapi.yaml`; si no
  responde, el `kernel-openapi.yaml` de `--kernel-repo`; o el que pases con
  `--spec <archivo|url>`. En TypeScript usa
  [openapi-typescript](https://openapi-ts.dev) (`paths`, `components`,
  `operations`).
- **Eventos**: `GET /events/catalog` → un tipo por evento
  (`MembershipActivatedV1Event`), la unión `MiRotaractEvent`,
  `MiRotaractEventType` y `MiRotaractEventMap`. Si el kernel todavía no
  publica el catálogo, avisa y genera solo la API.
- **Python**: `TypedDict` (las mismas claves que devuelve la API, como el
  SDK), `Literal` para los enums, `NotRequired` para lo opcional; Python
  3.10 necesita `typing_extensions` (viene con FastAPI).

## `mirotaract webhooks listen`

Recibe los eventos de tu app (socio activado, cargo asumido…) sin exponer tu
máquina a internet, y los reenvía a tu endpoint local:

```bash
mirotaract webhooks listen --forward-to http://localhost:3000/api/webhooks
# Listo. Reenviando eventos a http://localhost:3000/api/webhooks
# Secreto de firma de esta sesión: whsec_…
# 14:02:11  membership.activated.v1  evt_…  → 200 (12 ms)
```

- Se conecta al stream del kernel
  (`GET /developer-apps/{appId}/webhooks/stream`, Server-Sent Events) con las
  credenciales de la app (`MIROTARACT_APP_ID`, `MIROTARACT_CLIENT_ID`,
  `MIROTARACT_CLIENT_SECRET` de `.env.local` o las opciones
  `--app-id/--client-id/--client-secret`).
- Reenvía cada evento **tal cual** lo mandaría el kernel: mismo cuerpo,
  mismos encabezados `MiRotaract-Webhook-Id`, `MiRotaract-Webhook-Timestamp`
  y `MiRotaract-Signature`. Tu código de verificación es el mismo que en
  producción.
- La firma usa un secreto **propio de esta sesión**, que se imprime al
  conectar: ponelo en `MIROTARACT_WEBHOOK_SECRET` de tu app.
- `--events membership.*,ping.v1` filtra (comodín al final).
- Si se corta, reconecta solo (backoff exponencial con jitter, hasta 30 s,
  con `Last-Event-ID`). Credenciales inválidas o app inexistente cortan con
  un error claro. `Ctrl-C` sale y muestra un resumen.
- El stream solo existe con `KERNEL_WEBHOOK_STREAM_ENABLED=true` (activado en
  el kernel local, apagado en producción).

## Plantillas

Cada plantilla trae `README.md` (en castellano), `.env.example`, `.gitignore`
con `.env.local`, y `AGENTS.md`: contexto para asistentes de IA con la
checklist de seguridad (tokens nunca en `localStorage`, verificación con
JWKS, scopes mínimos, firma de webhooks).

| Plantilla | Login | Padrón |
|---|---|---|
| `next` | Next.js 15 + `@mirotaract/sdk/next` (cookie `httpOnly` cifrada) | Server Component con el token de servicio; `/api/members` para apps móviles; `/api/webhooks`. |
| `fastapi` | FastAPI + `mirotaract` (`AsyncMiRotaractAuth`), sesión del lado del servidor | `/padron` con `AsyncMiRotaract`; `/api/members`; `/api/webhooks`. |
| `flutter` | `flutter_appauth` (PKCE, app `PUBLIC`, sin secretos), refresh token en Keychain/Keystore | Llama a `/api/members` de tu backend (`next` o `fastapi`) con `Bearer`. |

**Regla de acceso al padrón** (la aplica tu app, no el kernel): el token de
servicio ve toda la organización de la app, así que las plantillas solo
muestran clubes donde la persona es socia `ACTIVE` u `ON_LEAVE`, consultando
sus membresías al kernel en el momento (`persons.memberships(sub)`).
