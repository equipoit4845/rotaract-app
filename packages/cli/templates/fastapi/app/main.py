"""App FastAPI conectada a Mi Rotaract.

- "Ingresar con Mi Rotaract" (OIDC + PKCE) con ``AsyncMiRotaractAuth``; sesión
  del lado del servidor (``app/sessions.py``).
- ``/padron``: padrón de los clubes de la persona, leído con el token de
  servicio de la app (``AsyncMiRotaract``, client_credentials).
- ``/api/members``: lo mismo en JSON para tu app móvil (Bearer de una app PUBLIC).
- ``/api/webhooks``: eventos firmados.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from html import escape
from typing import Any
from urllib.parse import quote

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response
from mirotaract import AsyncMiRotaract, AsyncMiRotaractAuth, MiRotaractApiError, MiRotaractOAuthError

from .config import LOGIN_SCOPE, settings
from .sessions import COOKIE, MemorySessionStore
from .webhooks import WebhookVerificationError, verify_webhook

log = logging.getLogger("app")
VISIBLE = {"ACTIVE", "ON_LEAVE"}
STATUS = {"ACTIVE": "Activo/a", "ON_LEAVE": "De licencia"}
ERRORS = {
    "access_denied": "Cancelaste el ingreso.",
    "login_expired": "El intento de ingreso venció. Probá de nuevo.",
    "invalid_state": "El intento de ingreso no coincide (¿dos pestañas?). Probá de nuevo.",
}


class State:
    auth: AsyncMiRotaractAuth
    data: AsyncMiRotaract
    mobile_auth: AsyncMiRotaractAuth | None
    sessions: MemorySessionStore
    seen_webhooks: set[str]


state = State()


@asynccontextmanager
async def lifespan(_: FastAPI):
    cfg = settings()
    state.auth = AsyncMiRotaractAuth(
        cfg.issuer, cfg.client_id, cfg.redirect_uri, client_secret=cfg.client_secret, scope=LOGIN_SCOPE
    )
    # Solo servidor: el secreto nunca sale de acá.
    state.data = AsyncMiRotaract(cfg.base_url, cfg.client_id, cfg.client_secret)
    # Verifica access tokens emitidos a TU app móvil (rechaza los de otras apps).
    state.mobile_auth = (
        AsyncMiRotaractAuth(cfg.issuer, cfg.public_client_id, cfg.redirect_uri) if cfg.public_client_id else None
    )
    state.sessions = MemorySessionStore(cfg.session_max_age)
    state.seen_webhooks = set()
    yield
    await state.auth.aclose()
    await state.data.aclose()
    if state.mobile_auth:
        await state.mobile_auth.aclose()


app = FastAPI(title="Mi Rotaract · plantilla FastAPI", lifespan=lifespan)


# --- sesión -------------------------------------------------------------------


def current_session(request: Request) -> dict[str, Any] | None:
    return state.sessions.get(request.cookies.get(COOKIE))


def set_session_cookie(response: Response, session_id: str) -> None:
    cfg = settings()
    response.set_cookie(
        COOKIE,
        session_id,
        max_age=cfg.session_max_age,
        httponly=True,
        secure=cfg.secure_cookies,
        samesite="lax",
        path="/",
    )


def safe_return_to(value: str | None) -> str:
    """Solo rutas relativas del mismo sitio: nada de redirecciones abiertas."""
    if not value or not value.startswith("/") or value.startswith("//") or value.startswith("/\\"):
        return "/"
    return value


# --- páginas ------------------------------------------------------------------


def page(title: str, body: str) -> HTMLResponse:
    return HTMLResponse(
        f"""<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>{escape(title)}</title>
<style>body{{font-family:system-ui,sans-serif;max-width:760px;margin:0 auto;padding:32px 16px}}
.button{{display:inline-block;padding:10px 18px;border-radius:8px;border:0;background:#d41367;color:#fff;
font:inherit;font-weight:600;text-decoration:none;cursor:pointer}}.secondary{{background:#eee;color:#222}}
.muted{{color:#666}}.error{{padding:12px;border-radius:8px;background:#fde7ef;color:#7a0b3a}}
table{{width:100%;border-collapse:collapse;margin:12px 0 32px}}th,td{{text-align:left;padding:8px 6px;border-bottom:1px solid #ddd}}</style>
</head><body>{body}</body></html>""",
        headers={"Cache-Control": "no-store"},
    )


@app.get("/", response_class=HTMLResponse)
async def home(request: Request, error: str | None = None):
    session = current_session(request)
    user = (session or {}).get("user")
    if not user:
        message = f'<p class="error">{escape(ERRORS.get(error, f"No pudimos completar el ingreso ({error}).") )}</p>' if error else ""
        return page(
            "Bienvenida/o",
            "<h1>Bienvenida/o</h1><p class=muted>Entrá con tu cuenta del distrito para ver el padrón de tu club.</p>"
            f'{message}<a class="button" href="/auth/login?returnTo=/padron">Ingresar con Mi Rotaract</a>',
        )
    name = user.get("given_name") or user.get("name") or "socio/a"
    return page(
        "Inicio",
        f"<h1>Hola, {escape(name)}</h1>"
        + '<p><a class="button" href="/padron">Ver el padrón de mi club</a></p>'
        '<form action="/auth/logout" method="post"><button class="button secondary" type="submit">Salir</button></form>',
    )


@app.get("/auth/login")
async def login(request: Request, returnTo: str | None = None):
    authorization = await state.auth.authorization_url()
    session_id = request.cookies.get(COOKIE)
    data = current_session(request) or {}
    data["login"] = {
        "state": authorization.state,
        "nonce": authorization.nonce,
        "verifier": authorization.code_verifier,
        "return_to": safe_return_to(returnTo),
    }
    response = RedirectResponse(authorization.url, status_code=302)
    set_session_cookie(response, state.sessions.save(data, session_id if current_session(request) else None))
    return response


@app.get("/auth/callback")
async def callback(request: Request):
    old_id = request.cookies.get(COOKIE)
    data = current_session(request) or {}
    pending = data.pop("login", None)
    if not pending:
        return RedirectResponse("/?error=login_expired", status_code=302)
    try:
        code = state.auth.parse_callback(str(request.url), pending["state"])
        tokens = await state.auth.exchange_code(code, pending["verifier"], nonce=pending["nonce"])
    except MiRotaractOAuthError as error:
        state.sessions.save(data, old_id)
        return RedirectResponse(f"/?error={quote(error.error)}", status_code=302)
    claims = tokens.claims or {}
    # Guardamos solo los claims verificados del id_token, no los tokens.
    user = {key: claims[key] for key in ("sub", "name", "given_name", "family_name") if key in claims}
    # Id de sesión nuevo al ingresar (evita fijación de sesión).
    state.sessions.delete(old_id)
    response = RedirectResponse(pending["return_to"], status_code=302)
    set_session_cookie(response, state.sessions.save({"user": user}))
    return response


@app.post("/auth/logout")
async def logout(request: Request):
    state.sessions.delete(request.cookies.get(COOKIE))
    response = RedirectResponse("/", status_code=302)
    response.delete_cookie(COOKIE, path="/")
    return response


async def rosters_for(person_id: str) -> list[dict[str, Any]]:
    """Regla de ESTA app: solo ves el padrón de clubes donde sos socio/a activo/a
    (o de licencia). Las membresías se consultan al kernel en el momento."""
    memberships = await state.data.persons.memberships(person_id)
    rosters = []
    for club in memberships:
        if club["organizationType"] != "CLUB" or club["status"] not in VISIBLE:
            continue
        members = await state.data.members.list(club["organizationId"], limit=100).all(max=1000)
        members = sorted(
            (m for m in members if m["status"] in VISIBLE), key=lambda m: m["person"]["displayName"].lower()
        )
        rosters.append({"club": club, "members": members})
    return rosters


@app.get("/padron", response_class=HTMLResponse)
async def padron(request: Request):
    session = current_session(request)
    if not session or not session.get("user"):
        return RedirectResponse("/auth/login?returnTo=/padron", status_code=302)
    try:
        rosters = await rosters_for(session["user"]["sub"])
    except MiRotaractApiError as error:
        log.warning("API de datos: %s %s traceId=%s", error.status, error.code, error.trace_id)
        return page(
            "Padrón",
            f"<h1>Padrón</h1><p class=error>No pudimos leer el padrón (HTTP {error.status}, traceId {escape(str(error.trace_id or '-'))}).</p>",
        )
    sections = []
    for roster in rosters:
        rows = "".join(
            f"<tr><td>{escape(m['person']['displayName'])}</td><td>{escape(m.get('memberNumber') or '—')}</td>"
            f"<td>{STATUS.get(m['status'], escape(m['status']))}</td></tr>"
            for m in roster["members"]
        )
        sections.append(
            f"<section><h2>{escape(roster['club']['organizationName'])}</h2>"
            f"<p class=muted>{len(roster['members'])} socios/as</p>"
            f"<table><thead><tr><th>Nombre</th><th>N.º</th><th>Estado</th></tr></thead><tbody>{rows}</tbody></table></section>"
        )
    empty = "" if rosters else "<p class=muted>No tenés una membresía activa en ningún club de esta app.</p>"
    return page("Padrón", f'<p><a href="/">← Inicio</a></p><h1>Padrón de mi club</h1>{empty}{"".join(sections)}')


# --- API para apps móviles ---------------------------------------------------------


def _unauthorized(description: str) -> HTTPException:
    return HTTPException(
        status_code=401,
        detail={"error": "invalid_token", "error_description": description},
        headers={"WWW-Authenticate": 'Bearer error="invalid_token"'},
    )


@app.get("/api/members")
async def api_members(request: Request):
    """Padrón en JSON para la app móvil (plantilla flutter): Bearer = access token
    de tu app PUBLIC. Se verifica la firma con el JWKS, que el token sea de esa app
    y contra /oauth/userinfo (ve revocaciones)."""
    if state.mobile_auth is None:
        return JSONResponse({"error": "not_configured", "error_description": "Falta MIROTARACT_PUBLIC_CLIENT_ID"}, 501)
    scheme, _, token = request.headers.get("authorization", "").partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise _unauthorized("Falta el token Bearer")
    try:
        claims = await state.mobile_auth.verify_access_token(token.strip())
        await state.mobile_auth.user_info(token.strip())
    except MiRotaractOAuthError as error:
        raise _unauthorized("Token inválido o vencido") from error
    rosters = await rosters_for(claims["sub"])
    return JSONResponse(
        {
            "clubs": [
                {
                    "organizationId": r["club"]["organizationId"],
                    "name": r["club"]["organizationName"],
                    "members": [
                        {
                            "membershipId": m["membershipId"],
                            "displayName": m["person"]["displayName"],
                            "memberNumber": m.get("memberNumber"),
                            "status": m["status"],
                        }
                        for m in r["members"]
                    ],
                }
                for r in rosters
            ]
        },
        headers={"Cache-Control": "no-store"},
    )


# --- webhooks -------------------------------------------------------------------


@app.post("/api/webhooks")
async def webhooks(request: Request):
    """En local: ``mirotaract webhooks listen --forward-to http://localhost:8000/api/webhooks``
    y MIROTARACT_WEBHOOK_SECRET = el secreto que imprime."""
    secret = settings().webhook_secret
    if not secret:
        return JSONResponse({"error": "Falta MIROTARACT_WEBHOOK_SECRET"}, 500)
    payload = await request.body()  # bytes crudos: la firma es sobre estos bytes
    try:
        event = verify_webhook(payload, request.headers, secret)
    except WebhookVerificationError as error:
        return JSONResponse({"error": str(error)}, 400)
    if event["id"] in state.seen_webhooks:  # en producción, deduplicá en tu base
        return {"ok": True, "duplicate": True}
    state.seen_webhooks.add(event["id"])
    log.warning("webhook %s %s org=%s", event["type"], event["id"], event.get("organizationId"))
    return {"ok": True}
