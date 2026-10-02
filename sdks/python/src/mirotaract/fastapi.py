"""FastAPI helper (``pip install 'mirotaract[fastapi]'``).

``require_user(auth)`` builds a dependency that protects routes of YOUR API
with the ``Authorization: Bearer <access_token>`` Mi Rotaract issued to your
app (e.g. a SPA or mobile app using a PUBLIC client):

- ``verify="userinfo"`` (default): asks ``/oauth/userinfo``, so revoked
  consents, suspended apps and disabled accounts are rejected immediately.
  Results are cached ``cache_ttl`` seconds (default 60).
- ``verify="jwt"``: local signature check against the JWKS; no network per
  request, but revocations are only noticed when the token expires (10 min).

For classic server-rendered apps prefer a server-side session: log the
person in with ``authorization_url`` / ``exchange_code`` and keep
``tokens.claims`` in your session store.
"""

from __future__ import annotations

import hashlib
import time
from typing import Any, Awaitable, Callable, Literal

from fastapi import HTTPException, Request
from starlette.concurrency import run_in_threadpool

from .auth import AsyncMiRotaractAuth, MiRotaractAuth
from .errors import MiRotaractOAuthError
from .types import UserInfo

__all__ = ["require_user"]


def _unauthorized(description: str) -> HTTPException:
    return HTTPException(
        status_code=401,
        detail={"error": "invalid_token", "error_description": description},
        # Header values must be ASCII; the human-readable text goes in the body.
        headers={"WWW-Authenticate": 'Bearer error="invalid_token"'},
    )


def require_user(
    auth: AsyncMiRotaractAuth | MiRotaractAuth,
    *,
    verify: Literal["userinfo", "jwt"] = "userinfo",
    cache_ttl: float = 60,
    authorize: Callable[[UserInfo], bool | Awaitable[bool]] | None = None,
    max_cache_entries: int = 1000,
) -> Callable[[Request], Awaitable[UserInfo]]:
    """Dependency returning the person's ``UserInfo`` (or 401/403)."""
    cache: dict[str, tuple[float, UserInfo]] = {}

    async def call(method: str, token: str) -> Any:
        fn = getattr(auth, method)
        if isinstance(auth, AsyncMiRotaractAuth):
            return await fn(token)
        return await run_in_threadpool(fn, token)

    async def dependency(request: Request) -> UserInfo:
        header = request.headers.get("authorization", "")
        scheme, _, token = header.partition(" ")
        token = token.strip()
        if scheme.lower() != "bearer" or not token:
            raise _unauthorized("Falta el token Bearer")
        key = hashlib.sha256(token.encode()).hexdigest()
        hit = cache.get(key)
        if hit and hit[0] > time.time():
            user = hit[1]
        else:
            try:
                if verify == "jwt":
                    claims = await call("verify_access_token", token)
                    user = UserInfo(sub=claims["sub"])  # type: ignore[typeddict-item]
                    if "scope" in claims:
                        user["scope"] = claims["scope"]  # type: ignore[typeddict-unknown-key]
                else:
                    user = await call("user_info", token)
            except MiRotaractOAuthError as error:
                raise _unauthorized("Token inválido o vencido") from error
            if cache_ttl > 0:
                if len(cache) >= max_cache_entries:
                    cache.pop(next(iter(cache)))
                cache[key] = (time.time() + cache_ttl, user)
        if authorize is not None:
            allowed = authorize(user)
            if not isinstance(allowed, bool):
                allowed = await allowed
            if not allowed:
                raise HTTPException(status_code=403, detail={"error": "forbidden"})
        return user

    return dependency
