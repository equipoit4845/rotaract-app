"""Configuración desde variables de entorno (.env.local, que escribe `mirotaract dev up`)."""

import os

from dotenv import load_dotenv

load_dotenv(".env.local")

ISSUER = os.environ.get("MIROTARACT_ISSUER", "http://localhost:54321/api/kernel/v1")
BASE_URL = os.environ.get("MIROTARACT_BASE_URL", ISSUER)
CLIENT_ID = os.environ.get("MIROTARACT_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("MIROTARACT_CLIENT_SECRET", "")
APP_URL = os.environ.get("APP_URL", "http://localhost:8000")

#: Datos que pedimos a la persona al ingresar.
LOGIN_SCOPE = "openid profile memberships"
