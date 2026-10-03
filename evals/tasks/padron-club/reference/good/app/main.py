import logging
from html import escape

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from mirotaract import MiRotaractApiError

from .auth import current_user, router
from .data import club_rosters

log = logging.getLogger("padron")
app = FastAPI(title="Padrón del club")
app.include_router(router)
STATUS = {"ACTIVE": "Activo/a", "ON_LEAVE": "De licencia"}


@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    user = current_user(request)
    if not user:
        return '<a href="/auth/login">Ingresar con Mi Rotaract</a>'
    return f'<h1>Hola, {escape(user.get("name") or "socio/a")}</h1><a href="/padron">Padrón</a>'


@app.get("/padron", response_class=HTMLResponse)
async def padron(request: Request):
    user = current_user(request)
    if not user:
        return RedirectResponse("/auth/login", status_code=302)
    try:
        rosters = await club_rosters(user["sub"])
    except MiRotaractApiError as error:
        log.warning("padron falló: status=%s traceId=%s", error.status, error.trace_id)
        return HTMLResponse("<p>No pudimos leer el padrón. Probá más tarde.</p>", status_code=502)
    if not rosters:
        return "<p>No tenés una membresía activa en un club.</p>"
    parts = []
    for roster in rosters:
        rows = "".join(
            f"<tr><td>{escape(m['person']['displayName'])}</td><td>{escape(m.get('memberNumber') or '—')}</td><td>{STATUS.get(m['status'], m['status'])}</td></tr>"
            for m in roster["members"]
        )
        parts.append(f"<h2>{escape(roster['club']['organizationName'])}</h2><table>{rows}</table>")
    log.info("padron mostrado: clubs=%d", len(rosters))
    return "".join(parts)
