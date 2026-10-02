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
LOGIN_SCOPE = "openid profile email memberships"


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
