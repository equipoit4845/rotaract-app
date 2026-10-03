# Quickstart: FastAPI

En 15 minutos: una app FastAPI donde la gente entra con su cuenta de Mi
Rotaract y ve el padrón de su club, contra un kernel local con datos
sintéticos. Usa el SDK de Python `mirotaract`. La configuración y las
sesiones son las de la plantilla `mirotaract init --template fastapi`; el
`main.py` de abajo es una versión reducida de la plantilla (que además trae
la API para apps móviles y los webhooks). Todo se verifica en CI
(`pnpm quickstarts:check`).

**Vas a necesitar:** Python 3.10+, Docker y la CLI `mirotaract` instalada
desde una copia del repositorio (la CLI y el SDK todavía no están en PyPI;
ver [cli.md](cli.md#0-requisitos-una-vez)).

## 1. Crear el proyecto y levantar el kernel local

```bash
mirotaract init padron-py --template fastapi --kernel-repo ~/rotaract-app
cd padron-py
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
mirotaract dev up --kernel-repo ~/rotaract-app --app-url http://localhost:8000
```

`requirements.txt` instala el SDK desde tu copia del repo
(`mirotaract[fastapi] @ file://…/sdks/python`), FastAPI, uvicorn y
python-dotenv. `dev up` escribe `.env.local` con las credenciales de la app
de prueba y registra `http://localhost:8000/auth/callback` como dirección de
regreso.

## 2. Configuración

```python runnable file=app/config.py from=packages/cli/templates/fastapi/app/config.py
"""Configuración desde variables de entorno (.env.local, que escribe `mirotaract dev up`)."""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache

from dotenv import load_dotenv

# .env.local primero (credenciales locales), después .env. Las variables que ya
# existen en el entorno (producción) nunca se pisan.
load_dotenv(".env.local")
load_dotenv(".env")

#: Datos que pedimos a la persona al ingresar. Pedí solo lo que uses.
LOGIN_SCOPE = "openid profile memberships"


def _required(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(
            f"Falta la variable {name}. Corré `mirotaract dev up` (kernel local) "
            "o completá .env.local a partir de .env.example."
        )
    return value


@dataclass(frozen=True)
class Settings:
    issuer: str
    base_url: str
    client_id: str
    client_secret: str
    app_url: str
    public_client_id: str | None
    webhook_secret: str | None
    session_max_age: int = 8 * 60 * 60

    @property
    def redirect_uri(self) -> str:
        return f"{self.app_url}/auth/callback"

    @property
    def secure_cookies(self) -> bool:
        return self.app_url.startswith("https://")


@lru_cache
def settings() -> Settings:
    return Settings(
        issuer=_required("MIROTARACT_ISSUER"),
        base_url=os.environ.get("MIROTARACT_BASE_URL") or _required("MIROTARACT_ISSUER"),
        client_id=_required("MIROTARACT_CLIENT_ID"),
        client_secret=_required("MIROTARACT_CLIENT_SECRET"),
        app_url=os.environ.get("APP_URL", "http://localhost:8000").rstrip("/"),
        public_client_id=os.environ.get("MIROTARACT_PUBLIC_CLIENT_ID") or None,
        webhook_secret=os.environ.get("MIROTARACT_WEBHOOK_SECRET") or None,
    )
```

## 3. Sesiones del lado del servidor

El navegador solo recibe un identificador aleatorio; los claims verificados
y la transacción de login quedan en el servidor.

```python runnable file=app/sessions.py from=packages/cli/templates/fastapi/app/sessions.py
"""Sesiones del lado del servidor.

El navegador solo recibe un identificador aleatorio en una cookie `httpOnly`
(`SameSite=Lax`, `Secure` con https). Los datos (claims verificados, la
transacción de login con state/nonce/code_verifier) quedan en el servidor.

Este almacén vive en memoria: alcanza para desarrollo y un solo proceso. En
producción usá Redis o tu base (misma interfaz: get / save / delete).
"""

from __future__ import annotations

import secrets
import time
from typing import Any

COOKIE = "mr_session"


class MemorySessionStore:
    def __init__(self, max_age: int):
        self.max_age = max_age
        self._data: dict[str, tuple[float, dict[str, Any]]] = {}

    def get(self, session_id: str | None) -> dict[str, Any] | None:
        if not session_id:
            return None
        entry = self._data.get(session_id)
        if not entry:
            return None
        expires, data = entry
        if expires < time.time():
            self._data.pop(session_id, None)
            return None
        return data

    def save(self, data: dict[str, Any], session_id: str | None = None) -> str:
        session_id = session_id or secrets.token_urlsafe(32)
        self._data[session_id] = (time.time() + self.max_age, data)
        if len(self._data) > 10_000:  # poda simple de vencidas
            now = time.time()
            for key in [k for k, (exp, _) in self._data.items() if exp < now]:
                self._data.pop(key, None)
        return session_id

    def delete(self, session_id: str | None) -> None:
        if session_id:
            self._data.pop(session_id, None)
```

## 4. Login y padrón

```python runnable file=app/main.py
"""Ingresar con Mi Rotaract + padrón del club (versión reducida de la plantilla)."""

from __future__ import annotations

from contextlib import asynccontextmanager
from html import escape
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from mirotaract import AsyncMiRotaract, AsyncMiRotaractAuth, MiRotaractApiError, MiRotaractOAuthError

from .config import LOGIN_SCOPE, settings
from .sessions import COOKIE, MemorySessionStore

VISIBLE = {"ACTIVE", "ON_LEAVE"}


class State:
    auth: AsyncMiRotaractAuth
    data: AsyncMiRotaract
    sessions: MemorySessionStore


state = State()


@asynccontextmanager
async def lifespan(_: FastAPI):
    cfg = settings()
    state.auth = AsyncMiRotaractAuth(
        cfg.issuer, cfg.client_id, cfg.redirect_uri, client_secret=cfg.client_secret, scope=LOGIN_SCOPE
    )
    # Solo servidor: el secreto nunca sale de acá.
    state.data = AsyncMiRotaract(cfg.base_url, cfg.client_id, cfg.client_secret)
    state.sessions = MemorySessionStore(cfg.session_max_age)
    yield
    await state.auth.aclose()
    await state.data.aclose()


app = FastAPI(lifespan=lifespan)


def set_cookie(response: Response, session_id: str) -> None:
    cfg = settings()
    response.set_cookie(
        COOKIE, session_id, max_age=cfg.session_max_age, httponly=True, secure=cfg.secure_cookies, samesite="lax"
    )


@app.get("/auth/login")
async def login(request: Request) -> Response:
    authorization = await state.auth.authorization_url()
    pending = {"state": authorization.state, "nonce": authorization.nonce, "verifier": authorization.code_verifier}
    response = RedirectResponse(authorization.url, status_code=302)
    set_cookie(response, state.sessions.save({"login": pending}))
    return response


@app.get("/auth/callback")
async def callback(request: Request) -> Response:
    old_id = request.cookies.get(COOKIE)
    pending = (state.sessions.get(old_id) or {}).get("login")
    if not pending:
        return RedirectResponse("/?error=login_expired", status_code=302)
    try:
        code = state.auth.parse_callback(str(request.url), pending["state"])
        tokens = await state.auth.exchange_code(code, pending["verifier"], nonce=pending["nonce"])
    except MiRotaractOAuthError as error:
        return RedirectResponse(f"/?error={error.error}", status_code=302)
    claims = tokens.claims or {}
    user = {key: claims[key] for key in ("sub", "name") if key in claims}
    state.sessions.delete(old_id)  # id de sesión nuevo al ingresar
    response = RedirectResponse("/padron", status_code=302)
    set_cookie(response, state.sessions.save({"user": user}))
    return response


async def rosters_for(person_id: str) -> list[dict[str, Any]]:
    """Regla de ESTA app: solo el padrón de clubes donde sos socio/a activo/a."""
    rosters = []
    for club in await state.data.persons.memberships(person_id):
        if club["organizationType"] != "CLUB" or club["status"] not in VISIBLE:
            continue
        members = await state.data.members.list(club["organizationId"], limit=100).all(max=1000)
        rosters.append({"club": club, "members": [m for m in members if m["status"] in VISIBLE]})
    return rosters


@app.get("/padron", response_class=HTMLResponse)
async def padron(request: Request) -> Response:
    session = state.sessions.get(request.cookies.get(COOKIE)) or {}
    if "user" not in session:
        return RedirectResponse("/auth/login", status_code=302)
    try:
        rosters = await rosters_for(session["user"]["sub"])
    except MiRotaractApiError as error:
        # El traceId te lleva al registro del pedido en la consola de apps.
        return HTMLResponse(f"No pudimos leer el padrón (traceId {escape(str(error.trace_id))})", status_code=502)
    items = "".join(
        f"<h2>{escape(r['club']['organizationName'])}</h2><ul>"
        + "".join(f"<li>{escape(m['person']['displayName'])}</li>" for m in r["members"])
        + "</ul>"
        for r in rosters
    )
    return HTMLResponse(f"<h1>Padrón</h1>{items}", headers={"Cache-Control": "no-store"})


@app.get("/", response_class=HTMLResponse)
async def home() -> str:
    return '<a href="/auth/login">Ingresar con Mi Rotaract</a>'
```

## 5. Probar

```bash
.venv/bin/uvicorn app.main:app --reload --port 8000
```

Abrí `http://localhost:8000`, ingresá con `socio.norte@example.org` /
`sandbox-9999` y vas a ver el padrón del club sintético. Si un pedido al
kernel falla, el `traceId` del error te lleva a su registro en la consola
local (`http://localhost:54322/developer/apps` → tu app → **Registros**).

## 6. Antes de producción

- Cambiá `MemorySessionStore` por Redis o tu base (misma interfaz).
- Servilo con https (`secure_cookies` se activa solo con `APP_URL=https://…`).
- La plantilla completa trae `/api/members` para apps móviles y `/api/webhooks`
  con la firma verificada ([webhooks.md](webhooks.md)).
- Revisá la [checklist de seguridad](seguridad.md).
