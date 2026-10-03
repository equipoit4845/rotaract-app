---
name: mirotaract-ingresar
title: Agregar "Ingresar con Mi Rotaract" (OIDC + PKCE)
description: >-
  Agrega el inicio de sesión "Ingresar con Mi Rotaract" (OAuth 2.0 authorization
  code + PKCE S256 y OpenID Connect) a una app Next.js, Express, FastAPI o
  Flutter, con sesión del lado del servidor y verificación del id_token por
  JWKS. Usala cuando pidan login, ingreso, autenticación de personas, SSO o
  "entrar con la cuenta del distrito / de Mi Rotaract".
globs:
  - "**/auth/**"
  - "**/middleware.*"
  - "**/*.{ts,tsx,js,mjs,py,dart}"
---

## Antes de escribir código

1. **Qué tipo de app es** (lo decide el RDR al registrarla y no se cambia):
   - App web con servidor (Next.js, Express, FastAPI…) → `CONFIDENTIAL`, patrón
     **BFF**: el servidor hace el flujo, guarda lo que haga falta y al navegador
     le da solo una cookie `httpOnly`. Es la opción recomendada.
   - App móvil (Flutter) o SPA pura → `PUBLIC`: sin secreto, solo `client_id` +
     PKCE. El backend que le sirva datos verifica sus access tokens.
2. **Scopes OIDC**: siempre `openid`; agregá solo lo que la app usa:
   `profile` (nombre y foto), `email`, `memberships` (clubes `ACTIVE`/`ON_LEAVE`
   dentro del alcance de la app), `positions` (cargos `ACTIVE`). Los scopes
   `kernel.service.*` **no** se piden en el login.
3. **Variables de entorno** (las escribe `mirotaract dev up` en `.env.local`
   para el kernel local; en producción las da el RDR):

   | Variable | Valor |
   |---|---|
   | `MIROTARACT_ISSUER` | `https://api.rotaract4845.com/api/kernel/v1` (local: `http://localhost:54321/api/kernel/v1`) |
   | `MIROTARACT_CLIENT_ID` | `mra_…` |
   | `MIROTARACT_CLIENT_SECRET` | `mrs_…` (solo apps `CONFIDENTIAL`, solo servidor) |
   | `APP_URL` | URL pública de la app; la dirección de regreso es `${APP_URL}/auth/callback` y tiene que estar registrada **idéntica** |
   | `SESSION_SECRET` | 32+ caracteres aleatorios (cifra la cookie o firma la sesión) |

4. **Usá el SDK oficial** (`@mirotaract/sdk` para JS/TS, `mirotaract` para
   Python). Ya genera `state`, `nonce` y PKCE `S256`, valida `state` y verifica
   el `id_token` contra el JWKS (ES256, `iss`, `aud`, `exp`, `azp`, `nonce`).
   Todavía no están en npm/PyPI: se instalan desde el repo del kernel
   (`mirotaract init --kernel-repo …` lo resuelve solo).

## Next.js (App Router)

```ts
// src/lib/mirotaract.ts
import "server-only"; // rompe el build si un componente "use client" lo importa
import { MiRotaractAuth } from "@mirotaract/sdk";
import { createMiRotaractNext } from "@mirotaract/sdk/next";

export const LOGIN_SCOPE = "openid profile email"; // solo lo que usás

export const mr = createMiRotaractNext({
  auth: new MiRotaractAuth({
    issuer: process.env.MIROTARACT_ISSUER!,
    clientId: process.env.MIROTARACT_CLIENT_ID!,
    clientSecret: process.env.MIROTARACT_CLIENT_SECRET!,
    redirectUri: `${process.env.APP_URL}/auth/callback`,
    scope: LOGIN_SCOPE,
  }),
  secret: process.env.SESSION_SECRET!, // cookie httpOnly cifrada; no guarda tokens
  scope: LOGIN_SCOPE,
  sessionMaxAgeSec: 8 * 60 * 60,
});
```

```ts
// src/app/auth/login/route.ts     (acepta ?returnTo=/ruta-relativa)
import { mr } from "@/lib/mirotaract";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => mr.login(request);

// src/app/auth/callback/route.ts
export const GET = (request: Request) => mr.callback(request);

// src/app/auth/logout/route.ts    (POST desde un <form>, nunca un link GET)
export const POST = (request: Request) => mr.logout(request);
```

```tsx
// src/app/panel/page.tsx (Server Component)
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { mr } from "@/lib/mirotaract";

export default async function Panel() {
  const session = await mr.getSession(await cookies());
  if (!session) redirect("/auth/login?returnTo=/panel");
  return <h1>Hola, {session.user.name}</h1>; // identificá por session.user.sub
}
```

- No uses `NEXT_PUBLIC_` para nada de esto. Si un componente cliente necesita
  saber quién es la persona, pasale props desde el Server Component (solo
  nombre, nunca tokens).
- `storeTokens: true` guarda `accessToken`/`refreshToken` en la cookie cifrada
  (y `logout` revoca el refresh token); sin eso, la cookie solo tiene claims.

## Express

```ts
import express from "express";
import session from "express-session";
import { MiRotaractAuth, MiRotaractOAuthError } from "@mirotaract/sdk";
import { requireMiRotaractUser } from "@mirotaract/sdk/express";

const auth = new MiRotaractAuth({
  issuer: process.env.MIROTARACT_ISSUER!,
  clientId: process.env.MIROTARACT_CLIENT_ID!,
  clientSecret: process.env.MIROTARACT_CLIENT_SECRET,
  redirectUri: `${process.env.APP_URL}/auth/callback`,
  scope: "openid profile email",
});

const app = express();
app.use(
  session({
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, secure: process.env.APP_URL!.startsWith("https://"), sameSite: "lax" },
  }),
);

app.get("/auth/login", async (req, res) => {
  const { url, codeVerifier, state, nonce } = await auth.authorizationUrl();
  req.session.oidc = { codeVerifier, state, nonce }; // del lado del servidor
  res.redirect(url);
});

app.get("/auth/callback", async (req, res, next) => {
  const pending = req.session.oidc;
  delete req.session.oidc;
  try {
    const { code } = auth.parseCallback(req.originalUrl, { state: pending?.state ?? "" });
    const tokens = await auth.exchangeCode({ code, codeVerifier: pending!.codeVerifier, nonce: pending!.nonce });
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.miRotaractUser = tokens.claims; // id_token ya verificado
      res.redirect("/");
    });
  } catch (error) {
    if (error instanceof MiRotaractOAuthError) return res.redirect(`/?error=${encodeURIComponent(error.error)}`);
    next(error);
  }
});

app.use("/panel", requireMiRotaractUser({ source: "session", getUser: (req) => req.session.miRotaractUser }));
```

Sin SDK (por ejemplo con `jose`), la verificación del `id_token` tiene que
fijar **issuer, audience y algoritmo**, y comparar el `nonce`:

```ts
import { createRemoteJWKSet, jwtVerify } from "jose";
const jwks = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`));
const { payload } = await jwtVerify(tokens.id_token, jwks, {
  issuer: ISSUER,
  audience: CLIENT_ID,
  algorithms: ["ES256"],
});
if (payload.nonce !== pending.nonce) throw new Error("nonce inválido");
```

## FastAPI

```python
from fastapi import FastAPI, Request
from fastapi.responses import RedirectResponse
from mirotaract import AsyncMiRotaractAuth, MiRotaractOAuthError

auth = AsyncMiRotaractAuth(
    settings.issuer, settings.client_id, f"{settings.app_url}/auth/callback",
    client_secret=settings.client_secret,  # de os.environ, nunca en el código
    scope="openid profile email",
)

@app.get("/auth/login")
async def login(request: Request):
    authz = await auth.authorization_url()
    sid = sessions.save({"login": {"state": authz.state, "nonce": authz.nonce, "verifier": authz.code_verifier}})
    response = RedirectResponse(authz.url, status_code=302)
    response.set_cookie("sid", sid, httponly=True, secure=settings.app_url.startswith("https://"), samesite="lax")
    return response

@app.get("/auth/callback")
async def callback(request: Request):
    pending = sessions.pop_login(request.cookies.get("sid"))
    if not pending:
        return RedirectResponse("/?error=login_expired", status_code=302)
    try:
        code = auth.parse_callback(str(request.url), pending["state"])  # valida state
        tokens = await auth.exchange_code(code, pending["verifier"], nonce=pending["nonce"])
    except MiRotaractOAuthError as error:
        return RedirectResponse(f"/?error={error.error}", status_code=302)
    claims = tokens.claims  # id_token verificado contra el JWKS
    sid = sessions.save({"user": {"sub": claims["sub"], "name": claims.get("name")}})  # id de sesión NUEVO
    response = RedirectResponse("/", status_code=302)
    response.set_cookie("sid", sid, httponly=True, secure=settings.app_url.startswith("https://"), samesite="lax")
    return response
```

Para una API que recibe `Authorization: Bearer` de tu app móvil:
`from mirotaract.fastapi import require_user` → `current_user = require_user(auth)`
y `Depends(current_user)` (verifica contra userinfo, ve revocaciones).

Sin SDK: `jwt.decode(id_token, key, algorithms=["ES256"], audience=CLIENT_ID, issuer=ISSUER)`
con la clave de `jwt.PyJWKClient(f"{ISSUER}/.well-known/jwks.json")`, y
comparar `claims["nonce"]`.

## Flutter (app `PUBLIC`)

```dart
final result = await const FlutterAppAuth().authorizeAndExchangeCode(
  AuthorizationTokenRequest(
    AppConfig.clientId,          // --dart-define, sin secretos
    AppConfig.redirectUri,       // https:// (App/Universal Links) o http://127.0.0.1:<puerto>
    issuer: AppConfig.issuer,    // descubre endpoints; PKCE S256, state y nonce los maneja AppAuth
    scopes: const ['openid', 'profile'],
  ),
);
// access token: solo en memoria. refresh token: FlutterSecureStorage (Keychain/Keystore).
await const FlutterSecureStorage().write(key: 'mirotaract_refresh_token', value: result.refreshToken);
```

- **Nunca** un `client_secret` en la app: todo lo de `--dart-define` termina en
  el binario.
- Los esquemas propios (`com.miclub.app:/callback`) **no se aceptan**; usá
  `https://` con App Links / Universal Links o `http://127.0.0.1`.
- Navegador del sistema (lo hace AppAuth), nunca un WebView embebido.
- Los datos del club los pide a TU backend con `Authorization: Bearer
  <access_token>`; el backend verifica el token (JWKS + userinfo) y que sea de
  tu `client_id` (`MIROTARACT_PUBLIC_CLIENT_ID`) antes de responder.

## Errores típicos

- `access_denied` en el callback: la persona tocó Cancelar. Mensaje amable.
- `invalid_grant` al canjear: código vencido (60 s), ya usado o `redirect_uri`
  distinta. Empezá el ingreso de nuevo, no reintentes con el mismo código.
- Mi Rotaract muestra un error en su página y no vuelve: `redirect_uri` no
  registrada, falta `openid` o scope no habilitado. En local:
  `mirotaract dev up --app-url http://localhost:<puerto>`.
- El `access_token` de una persona **solo sirve para `/oauth/userinfo`**; los
  datos del padrón se leen con el token de servicio (skill
  `mirotaract-padron`).
- Refresh tokens: rotan en cada uso (guardá siempre el nuevo, de forma
  atómica) y un reuso revoca todos. Un refresh a la vez por persona.
- `returnTo` solo rutas relativas (`/…`, no `//…`): nada de redirecciones
  abiertas.

## Probalo

`mirotaract dev up` y entrá con `socio.norte@example.org` / `sandbox-9999`
(skill `mirotaract-kernel-local`). Con el MCP: `search_docs "id_token nonce"`,
`describe_operation issueOAuthToken`.
