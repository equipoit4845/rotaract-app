import httpx
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse

from . import config
from .auth import current_user, router

app = FastAPI(title="Padrón del club")
app.include_router(router)


def service_token() -> str:
    response = httpx.post(
        f"{config.BASE_URL}/oauth/token",
        auth=(config.CLIENT_ID, config.CLIENT_SECRET),
        data={"grant_type": "client_credentials", "scope": "kernel.service.memberships.read kernel.service.persons.contact.read"},
    )
    return response.json()["access_token"]


@app.get("/padron", response_class=HTMLResponse)
async def padron(request: Request):
    user = current_user(request)
    token = service_token()
    club_id = request.query_params.get("club")
    page = httpx.get(
        f"{config.BASE_URL}/service/organizations/{club_id}/members",
        headers={"Authorization": f"Bearer {token}"},
    ).json()
    rows = ""
    for member in page["items"]:
        print("socio", member["person"]["displayName"], member["person"].get("email"))
        rows += f"<tr><td>{member['person']['displayName']}</td><td>{member['person'].get('email')}</td></tr>"
    return f"""<table>{rows}</table>
<script>localStorage.setItem("mr_token", "{token}");</script>"""
