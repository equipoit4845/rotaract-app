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
