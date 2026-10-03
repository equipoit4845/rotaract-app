"""Ingresar con Mi Rotaract (ya resuelto): sesión del lado del servidor."""

import secrets
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse
from mirotaract import AsyncMiRotaractAuth, MiRotaractOAuthError

from . import config

router = APIRouter()
auth = AsyncMiRotaractAuth(
    config.ISSUER, config.CLIENT_ID, f"{config.APP_URL}/auth/callback",
    client_secret=config.CLIENT_SECRET, scope=config.LOGIN_SCOPE,
)
SESSIONS: dict[str, dict[str, Any]] = {}
COOKIE = "sid"


def current_user(request: Request) -> dict[str, Any] | None:
    """Claims verificados del id_token de quien ingresó, o None."""
    return SESSIONS.get(request.cookies.get(COOKIE, ""), {}).get("user")


@router.get("/auth/login")
async def login():
    authz = await auth.authorization_url()
    sid = secrets.token_urlsafe(32)
    SESSIONS[sid] = {"login": {"state": authz.state, "nonce": authz.nonce, "verifier": authz.code_verifier}}
    response = RedirectResponse(authz.url, status_code=302)
    response.set_cookie(COOKIE, sid, httponly=True, samesite="lax", secure=config.APP_URL.startswith("https://"))
    return response


@router.get("/auth/callback")
async def callback(request: Request):
    pending = SESSIONS.pop(request.cookies.get(COOKIE, ""), {}).get("login")
    if not pending:
        return RedirectResponse("/?error=login_expired", status_code=302)
    try:
        code = auth.parse_callback(str(request.url), pending["state"])
        tokens = await auth.exchange_code(code, pending["verifier"], nonce=pending["nonce"])
    except MiRotaractOAuthError as error:
        return RedirectResponse(f"/?error={error.error}", status_code=302)
    sid = secrets.token_urlsafe(32)
    SESSIONS[sid] = {"user": {"sub": tokens.claims["sub"], "name": tokens.claims.get("name")}}
    response = RedirectResponse("/", status_code=302)
    response.set_cookie(COOKIE, sid, httponly=True, samesite="lax", secure=config.APP_URL.startswith("https://"))
    return response
