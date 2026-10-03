from html import escape

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse

from .auth import current_user, router

app = FastAPI(title="Padrón del club")
app.include_router(router)


@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    user = current_user(request)
    if not user:
        return '<a href="/auth/login">Ingresar con Mi Rotaract</a>'
    return f"<h1>Hola, {escape(user.get('name') or 'socio/a')}</h1>"
