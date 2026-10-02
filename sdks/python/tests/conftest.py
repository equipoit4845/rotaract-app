"""In-memory fake of the Kernel's OAuth/OIDC + service API behind
httpx.MockTransport (works for both httpx.Client and httpx.AsyncClient)."""

from __future__ import annotations

import base64
import json
import re
import time
from dataclasses import dataclass
from typing import Any, Callable
from urllib.parse import parse_qs, unquote

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from jwt.algorithms import ECAlgorithm

ISSUER = "https://kernel.test/api/kernel/v1"
CLIENT_ID = "mra_0123456789abcdef0123"
CLIENT_SECRET = "mrs_secret-value"
REDIRECT_URI = "https://app.test/callback"


@dataclass
class Recorded:
    method: str
    url: httpx.URL
    headers: httpx.Headers
    body: bytes

    @property
    def path(self) -> str:
        return self.url.path.replace("/api/kernel/v1", "", 1)

    @property
    def form(self) -> dict[str, str]:
        return {k: v[-1] for k, v in parse_qs(self.body.decode()).items()}

    @property
    def json(self) -> Any:
        return json.loads(self.body) if self.body else None


Reply = tuple  # (status, body[, headers])


class FakeKernel:
    def __init__(self) -> None:
        self.calls: list[Recorded] = []
        self.routes: dict[tuple[str, str], Callable[[Recorded], Reply]] = {}
        self.keys: list[tuple[str, Any, dict]] = []
        self.token_counter = 0
        self.token_expires_in = 600
        self.add_key("k1")
        self._install_defaults()

    def add_key(self, kid: str) -> None:
        private = ec.generate_private_key(ec.SECP256R1())
        public_jwk = ECAlgorithm.to_jwk(private.public_key(), as_dict=True)
        public_jwk.update({"kid": kid, "alg": "ES256", "use": "sig"})
        self.keys.append((kid, private, public_jwk))

    def sign(
        self,
        claims: dict[str, Any] | None = None,
        *,
        kid: str | None = None,
        audience: str = CLIENT_ID,
        issuer: str = ISSUER,
        expires_in: int = 600,
        subject: str = "person_1",
    ) -> str:
        kid = kid or self.keys[0][0]
        private = next(k[1] for k in self.keys if k[0] == kid)
        now = int(time.time())
        payload = {"iss": issuer, "aud": audience, "sub": subject, "iat": now, "exp": now + expires_in}
        payload.update(claims or {})
        return jwt.encode(payload, private, algorithm="ES256", headers={"kid": kid})

    def on(self, method: str, path: str, handler: Callable[[Recorded], Reply]) -> None:
        self.routes[(method, path)] = handler

    def calls_to(self, method: str, path: str) -> list[Recorded]:
        return [c for c in self.calls if c.method == method and c.path == path]

    def _install_defaults(self) -> None:
        self.on(
            "GET",
            "/.well-known/openid-configuration",
            lambda r: (
                200,
                {
                    "issuer": ISSUER,
                    "authorization_endpoint": "https://web.test/oauth/authorize",
                    "token_endpoint": f"{ISSUER}/oauth/token",
                    "userinfo_endpoint": f"{ISSUER}/oauth/userinfo",
                    "revocation_endpoint": f"{ISSUER}/oauth/revoke",
                    "jwks_uri": f"{ISSUER}/.well-known/jwks.json",
                    "code_challenge_methods_supported": ["S256"],
                },
            ),
        )
        self.on("GET", "/.well-known/jwks.json", lambda r: (200, {"keys": [k[2] for k in self.keys]}))
        self.on("POST", "/oauth/token", self._token)

    def client_secret_of(self, request: Recorded) -> str | None:
        auth = request.headers.get("authorization", "")
        if auth.startswith("Basic "):
            _, _, secret = base64.b64decode(auth[6:]).decode().partition(":")
            return unquote(secret)
        return request.form.get("client_secret")

    def _token(self, request: Recorded) -> Reply:
        if self.client_secret_of(request) != CLIENT_SECRET:
            return 401, {"error": "invalid_client", "error_description": "Client authentication failed"}
        if request.form.get("grant_type") == "client_credentials":
            self.token_counter += 1
            return 200, {
                "access_token": f"svc_{self.token_counter}",
                "token_type": "Bearer",
                "expires_in": self.token_expires_in,
                "scope": "kernel.service.organizations.read kernel.service.memberships.read",
            }
        return 400, {"error": "unsupported_grant_type"}

    def handler(self, request: httpx.Request) -> httpx.Response:
        recorded = Recorded(request.method, request.url, request.headers, request.read())
        self.calls.append(recorded)
        handler = self.routes.get((request.method, recorded.path))
        if handler is None:
            for (method, pattern), candidate in self.routes.items():
                if method == request.method and ":" in pattern:
                    regex = "^" + re.sub(r":[^/]+", "[^/]+", pattern) + "$"
                    if re.match(regex, recorded.path):
                        handler = candidate
        if handler is None:
            return httpx.Response(
                404,
                json={"status": 404, "code": "KERNEL_HTTP_404", "title": "Request failed", "detail": "no route"},
            )
        reply = handler(recorded)
        status, body = reply[0], reply[1]
        headers = reply[2] if len(reply) > 2 else {}
        if body is None or status in (204, 304):
            return httpx.Response(status, headers=headers)
        return httpx.Response(status, json=body, headers=headers)

    def sync_client(self) -> httpx.Client:
        return httpx.Client(transport=httpx.MockTransport(self.handler))

    def async_client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=httpx.MockTransport(self.handler))


@pytest.fixture
def kernel() -> FakeKernel:
    return FakeKernel()


def no_sleep(_: float) -> None:
    return None


async def async_no_sleep(_: float) -> None:
    return None
