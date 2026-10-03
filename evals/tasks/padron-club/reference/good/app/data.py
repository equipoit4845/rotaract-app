"""API de datos de Mi Rotaract con el token de servicio (solo servidor)."""

from mirotaract import AsyncMiRotaract

from . import config

VISIBLE = {"ACTIVE", "ON_LEAVE"}

#: Solo lo que usa este proceso: el padrón.
data = AsyncMiRotaract(
    config.BASE_URL,
    config.CLIENT_ID,
    config.CLIENT_SECRET,
    scope=["kernel.service.memberships.read"],
)


async def club_rosters(person_id: str) -> list[dict]:
    """Padrón de los clubes donde la persona es socia activa o de licencia (consultado en el momento)."""
    rosters = []
    for club in await data.persons.memberships(person_id):
        if club["organizationType"] != "CLUB" or club["status"] not in VISIBLE:
            continue
        members = [m async for m in data.members.list(club["organizationId"], limit=100) if m["status"] in VISIBLE]
        members.sort(key=lambda m: m["person"]["displayName"].lower())
        rosters.append({"club": club, "members": members})
    return rosters
