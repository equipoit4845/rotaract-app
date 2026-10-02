""""Ingresar con Mi Rotaract": OAuth 2.0 authorization code + PKCE (S256)
and OpenID Connect, sync (``MiRotaractAuth``) and async
(``AsyncMiRotaractAuth``)."""

from __future__ import annotations

import base64
import hashlib
import secrets
import time
from typing import Any, Mapping, Sequence
from urllib.parse import parse_qs, urlencode, urlsplit, urlunsplit

import httpx
import jwt

from ._http import AsyncHttp, HttpConfig, SyncHttp, basic_auth
from .errors import MiRotaractConfigError, MiRotaractError, MiRotaractOAuthError
from .types import AuthorizationRequest, TokenSet, UserInfo

#: ``aud`` of access tokens that call the Kernel's own APIs.
KERNEL_AUDIENCE = "institutional-kernel"


def normalize_issuer(issuer: str) -> str:
    return issuer.rstrip("/")


def pkce_challenge(verifier: str) -> str:
    """PKCE S256 (RFC 7636 §4.2): base64url(sha256(verifier)), no padding."""
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def random_token(nbytes: int = 32) -> str:
    return secrets.token_urlsafe(nbytes)


def _scope_string(scope: str | Sequence[str] | None, fallback: str) -> str:
    if not scope:
        return fallback
    return scope if isinstance(scope, str) else " ".join(scope)


def check_discovery(issuer: str, data: Any) -> dict[str, Any]:
    if not isinstance(data, Mapping) or normalize_issuer(str(data.get("issuer", ""))) != issuer:
        found = data.get("issuer") if isinstance(data, Mapping) else None
        raise MiRotaractConfigError(
            f'El discovery declara issuer "{found}", distinto del configurado "{issuer}".'
        )
    return dict(data)


def token_set(data: Any) -> TokenSet:
    if not isinstance(data, Mapping) or not data.get("access_token"):
        raise MiRotaractOAuthError("invalid_response", "El endpoint de tokens no devolvió access_token")
    expires_in = int(data.get("expires_in") or 0)
    return TokenSet(
        access_token=data["access_token"],
        token_type=data.get("token_type", "Bearer"),
        expires_in=expires_in,
        expires_at=time.time() + expires_in,
        scope=data.get("scope", ""),
        id_token=data.get("id_token"),
        refresh_token=data.get("refresh_token"),
    )


def client_auth(
    client_id: str,
    client_secret: str | None,
    method: str | None,
    form: dict[str, str | None],
) -> dict[str, str]:
    """Adds RFC 6749 §2.3 client authentication; returns extra headers."""
    if client_secret:
        if method == "client_secret_post":
            form["client_id"] = client_id
            form["client_secret"] = client_secret
            return {}
        return {"authorization": basic_auth(client_id, client_secret)}
    form["client_id"] = client_id
    return {}


class _AuthCore:
    def __init__(
        self,
        *,
        issuer: str,
        client_id: str,
        redirect_uri: str,
        client_secret: str | None = None,
        scope: str | Sequence[str] | None = None,
        client_auth_method: str | None = None,
        clock_tolerance: int = 30,
        jwks_ttl: float = 600,
        jwks_cooldown: float = 30,
        discovery_ttl: float = 3600,
    ):
        if not issuer:
            raise MiRotaractConfigError("Falta `issuer`.")
        if not client_id:
            raise MiRotaractConfigError("Falta `client_id`.")
        if not redirect_uri:
            raise MiRotaractConfigError("Falta `redirect_uri`.")
        self.issuer = normalize_issuer(issuer)
        self.client_id = client_id
        self.redirect_uri = redirect_uri
        self._client_secret = client_secret
        self._client_auth_method = client_auth_method
        self._default_scope = _scope_string(scope, "openid profile email")
        self.clock_tolerance = clock_tolerance
        self._jwks_ttl = jwks_ttl
        self._jwks_cooldown = jwks_cooldown
        self._discovery_ttl = discovery_ttl
        self._config: dict[str, Any] | None = None
        self._config_at = 0.0
        self._jwks: jwt.PyJWKSet | None = None
        self._jwks_at = 0.0
        self._jwks_fetched = 0.0

    # --- pure helpers --------------------------------------------------

    def _config_fresh(self) -> dict[str, Any] | None:
        if self._config and time.time() - self._config_at < self._discovery_ttl:
            return self._config
        return None

    def _store_config(self, data: Any) -> dict[str, Any]:
        self._config = check_discovery(self.issuer, data)
        self._config_at = time.time()
        return self._config

    def _build_authorization(
        self,
        config: Mapping[str, Any],
        scope: str | Sequence[str] | None,
        state: str | None,
        nonce: str | None,
        redirect_uri: str | None,
        extra_params: Mapping[str, str] | None,
    ) -> AuthorizationRequest:
        verifier = random_token(32)
        state = state or random_token(16)
        nonce = nonce or random_token(16)
        params = {
            "response_type": "code",
            "client_id": self.client_id,
            "redirect_uri": redirect_uri or self.redirect_uri,
            "scope": _scope_string(scope, self._default_scope),
            "state": state,
            "nonce": nonce,
            "code_challenge": pkce_challenge(verifier),
            "code_challenge_method": "S256",
            **(extra_params or {}),
        }
        parts = urlsplit(config["authorization_endpoint"])
        query = parse_qs(parts.query)
        merged = {**{k: v[-1] for k, v in query.items()}, **params}
        url = urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(merged), ""))
        return AuthorizationRequest(url=url, code_verifier=verifier, state=state, nonce=nonce)

    def parse_callback(self, url: str, state: str) -> str:
        """Returns the ``code`` of the callback URL after checking ``state``.

        Raises ``MiRotaractOAuthError`` (``access_denied``, ``invalid_state``...)."""
        query = parse_qs(urlsplit(url).query)
        get = lambda name: (query.get(name) or [None])[-1]  # noqa: E731
        if get("error"):
            raise MiRotaractOAuthError(get("error"), get("error_description"))
        if not state or get("state") != state:
            raise MiRotaractOAuthError("invalid_state", "El state del callback no coincide")
        code = get("code")
        if not code:
            raise MiRotaractOAuthError("invalid_request", "Falta code en el callback")
        return code

    def _token_form(self, params: dict[str, str | None]) -> tuple[dict[str, str | None], dict[str, str]]:
        form = dict(params)
        headers = client_auth(self.client_id, self._client_secret, self._client_auth_method, form)
        return form, headers

    def _revoke_form(self, token: str, hint: str | None) -> tuple[dict[str, str | None], dict[str, str]]:
        form: dict[str, str | None] = {"token": token, "token_type_hint": hint}
        headers = client_auth(self.client_id, self._client_secret, self._client_auth_method, form)
        return form, headers

    def _key_for(self, token: str) -> tuple[Any | None, bool]:
        """(key, should_refetch)."""
        try:
            header = jwt.get_unverified_header(token)
        except jwt.PyJWTError as error:
            raise MiRotaractOAuthError("invalid_token", f"Formato de JWT inválido: {error}") from error
        if header.get("alg") != "ES256":
            raise MiRotaractOAuthError("invalid_token", f"Algoritmo no permitido: {header.get('alg')}")
        expired = self._jwks is None or time.time() - self._jwks_at >= self._jwks_ttl
        if expired:
            return None, True
        kid = header.get("kid")
        for key in self._jwks.keys:  # type: ignore[union-attr]
            if kid is None or key.key_id == kid:
                return key, False
        return None, time.time() - self._jwks_fetched >= self._jwks_cooldown

    def _store_jwks(self, data: Any) -> None:
        self._jwks_fetched = time.time()
        try:
            self._jwks = jwt.PyJWKSet.from_dict(data)
        except jwt.PyJWTError as error:
            raise MiRotaractError(f"JWKS inválido: {error}") from error
        self._jwks_at = time.time()

    def _decode(self, token: str, key: Any, audience: str) -> dict[str, Any]:
        if key is None:
            raise MiRotaractOAuthError("invalid_token", "No hay una clave del JWKS para este token")
        try:
            return jwt.decode(
                token,
                key=key.key,
                algorithms=["ES256"],
                audience=audience,
                issuer=self.issuer,
                leeway=self.clock_tolerance,
                options={"require": ["exp", "iat", "iss", "aud", "sub"]},
            )
        except jwt.PyJWTError as error:
            raise MiRotaractOAuthError("invalid_token", str(error)) from error

    def _check_id_claims(self, claims: dict[str, Any], nonce: str | None, max_age: int | None) -> dict[str, Any]:
        if claims.get("azp") is not None and claims["azp"] != self.client_id:
            raise MiRotaractOAuthError("invalid_token", "azp no corresponde a esta app")
        if nonce is not None and claims.get("nonce") != nonce:
            raise MiRotaractOAuthError("invalid_token", "nonce inválido")
        if max_age is not None:
            auth_time = claims.get("auth_time")
            if not isinstance(auth_time, (int, float)) or time.time() - auth_time > max_age + self.clock_tolerance:
                raise MiRotaractOAuthError("invalid_token", "La autenticación es demasiado vieja")
        return claims

    def _check_access_claims(self, claims: dict[str, Any]) -> dict[str, Any]:
        if claims.get("token_use") != "user":
            raise MiRotaractOAuthError("invalid_token", "No es un access token de usuario")
        if self.client_id not in (claims.get("client_id"), claims.get("azp")):
            raise MiRotaractOAuthError("invalid_token", "El token fue emitido para otra app")
        return claims

    def _endpoint(self, config: Mapping[str, Any], name: str, fallback: str) -> str:
        return str(config.get(name) or f"{self.issuer}{fallback}")


class MiRotaractAuth(_AuthCore):
    """Synchronous OIDC client. Use one instance per app and reuse it (it
    caches discovery and the JWKS)."""

    def __init__(
        self,
        issuer: str,
        client_id: str,
        redirect_uri: str,
        client_secret: str | None = None,
        *,
        scope: str | Sequence[str] | None = None,
        client_auth_method: str | None = None,
        clock_tolerance: int = 30,
        http_client: httpx.Client | None = None,
        max_retries: int = 2,
        timeout: float = 30.0,
        jwks_cooldown: float = 30,
        sleep: Any = None,
    ):
        super().__init__(
            issuer=issuer,
            client_id=client_id,
            redirect_uri=redirect_uri,
            client_secret=client_secret,
            scope=scope,
            client_auth_method=client_auth_method,
            clock_tolerance=clock_tolerance,
            jwks_cooldown=jwks_cooldown,
        )
        self._http = SyncHttp(HttpConfig(max_retries=max_retries, timeout=timeout), http_client, sleep)

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> "MiRotaractAuth":
        return self

    def __exit__(self, *exc: Any) -> None:
        self.close()

    def discovery(self) -> dict[str, Any]:
        cached = self._config_fresh()
        if cached:
            return cached
        response = self._http.request("GET", f"{self.issuer}/.well-known/openid-configuration")
        return self._store_config(response.data)

    def authorization_url(
        self,
        *,
        scope: str | Sequence[str] | None = None,
        state: str | None = None,
        nonce: str | None = None,
        redirect_uri: str | None = None,
        extra_params: Mapping[str, str] | None = None,
    ) -> AuthorizationRequest:
        return self._build_authorization(self.discovery(), scope, state, nonce, redirect_uri, extra_params)

    def _token(self, params: dict[str, str | None]) -> TokenSet:
        form, headers = self._token_form(params)
        response = self._http.request("POST", self.discovery()["token_endpoint"], form=form, headers=headers)
        return token_set(response.data)

    def exchange_code(
        self,
        code: str,
        code_verifier: str,
        *,
        nonce: str | None = None,
        redirect_uri: str | None = None,
    ) -> TokenSet:
        tokens = self._token(
            {
                "grant_type": "authorization_code",
                "code": code,
                "code_verifier": code_verifier,
                "redirect_uri": redirect_uri or self.redirect_uri,
            }
        )
        if not tokens.id_token:
            if nonce:
                raise MiRotaractOAuthError("invalid_token", "El servidor no devolvió id_token")
            return tokens
        tokens.claims = self.verify_id_token(tokens.id_token, nonce=nonce)
        return tokens

    def refresh(self, refresh_token: str, *, scope: str | Sequence[str] | None = None) -> TokenSet:
        """Rotates the refresh token: always store the new one."""
        tokens = self._token(
            {
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "scope": _scope_string(scope, "") or None,
            }
        )
        if tokens.id_token:
            tokens.claims = self.verify_id_token(tokens.id_token)
        return tokens

    def _verify(self, token: str, audience: str) -> dict[str, Any]:
        key, refetch = self._key_for(token)
        if refetch:
            self._store_jwks(self._http.request("GET", self.discovery()["jwks_uri"]).data)
            key, _ = self._key_for(token)
        return self._decode(token, key, audience)

    def verify_id_token(self, id_token: str, *, nonce: str | None = None, max_age: int | None = None) -> dict[str, Any]:
        """Signature (remote JWKS, cached), iss, aud=client_id, exp, azp, nonce, max_age."""
        return self._check_id_claims(self._verify(id_token, self.client_id), nonce, max_age)

    def verify_access_token(self, access_token: str) -> dict[str, Any]:
        """Local check of a user access token issued to this app (can't see revocations)."""
        return self._check_access_claims(self._verify(access_token, KERNEL_AUDIENCE))

    def user_info(self, access_token: str) -> UserInfo:
        endpoint = self._endpoint(self.discovery(), "userinfo_endpoint", "/oauth/userinfo")
        return self._http.request("GET", endpoint, headers={"authorization": f"Bearer {access_token}"}).data

    def revoke(self, token: str, *, token_type_hint: str | None = None) -> None:
        """RFC 7009; succeeds for unknown tokens too."""
        form, headers = self._revoke_form(token, token_type_hint)
        endpoint = self._endpoint(self.discovery(), "revocation_endpoint", "/oauth/revoke")
        self._http.request("POST", endpoint, form=form, headers=headers)


class AsyncMiRotaractAuth(_AuthCore):
    """Asynchronous OIDC client (FastAPI, Starlette, aiohttp...)."""

    def __init__(
        self,
        issuer: str,
        client_id: str,
        redirect_uri: str,
        client_secret: str | None = None,
        *,
        scope: str | Sequence[str] | None = None,
        client_auth_method: str | None = None,
        clock_tolerance: int = 30,
        http_client: httpx.AsyncClient | None = None,
        max_retries: int = 2,
        timeout: float = 30.0,
        jwks_cooldown: float = 30,
        sleep: Any = None,
    ):
        super().__init__(
            issuer=issuer,
            client_id=client_id,
            redirect_uri=redirect_uri,
            client_secret=client_secret,
            scope=scope,
            client_auth_method=client_auth_method,
            clock_tolerance=clock_tolerance,
            jwks_cooldown=jwks_cooldown,
        )
        self._http = AsyncHttp(HttpConfig(max_retries=max_retries, timeout=timeout), http_client, sleep)

    async def aclose(self) -> None:
        await self._http.aclose()

    async def __aenter__(self) -> "AsyncMiRotaractAuth":
        return self

    async def __aexit__(self, *exc: Any) -> None:
        await self.aclose()

    async def discovery(self) -> dict[str, Any]:
        cached = self._config_fresh()
        if cached:
            return cached
        response = await self._http.request("GET", f"{self.issuer}/.well-known/openid-configuration")
        return self._store_config(response.data)

    async def authorization_url(
        self,
        *,
        scope: str | Sequence[str] | None = None,
        state: str | None = None,
        nonce: str | None = None,
        redirect_uri: str | None = None,
        extra_params: Mapping[str, str] | None = None,
    ) -> AuthorizationRequest:
        return self._build_authorization(await self.discovery(), scope, state, nonce, redirect_uri, extra_params)

    async def _token(self, params: dict[str, str | None]) -> TokenSet:
        form, headers = self._token_form(params)
        config = await self.discovery()
        response = await self._http.request("POST", config["token_endpoint"], form=form, headers=headers)
        return token_set(response.data)

    async def exchange_code(
        self,
        code: str,
        code_verifier: str,
        *,
        nonce: str | None = None,
        redirect_uri: str | None = None,
    ) -> TokenSet:
        tokens = await self._token(
            {
                "grant_type": "authorization_code",
                "code": code,
                "code_verifier": code_verifier,
                "redirect_uri": redirect_uri or self.redirect_uri,
            }
        )
        if not tokens.id_token:
            if nonce:
                raise MiRotaractOAuthError("invalid_token", "El servidor no devolvió id_token")
            return tokens
        tokens.claims = await self.verify_id_token(tokens.id_token, nonce=nonce)
        return tokens

    async def refresh(self, refresh_token: str, *, scope: str | Sequence[str] | None = None) -> TokenSet:
        tokens = await self._token(
            {
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "scope": _scope_string(scope, "") or None,
            }
        )
        if tokens.id_token:
            tokens.claims = await self.verify_id_token(tokens.id_token)
        return tokens

    async def _verify(self, token: str, audience: str) -> dict[str, Any]:
        key, refetch = self._key_for(token)
        if refetch:
            config = await self.discovery()
            self._store_jwks((await self._http.request("GET", config["jwks_uri"])).data)
            key, _ = self._key_for(token)
        return self._decode(token, key, audience)

    async def verify_id_token(
        self, id_token: str, *, nonce: str | None = None, max_age: int | None = None
    ) -> dict[str, Any]:
        return self._check_id_claims(await self._verify(id_token, self.client_id), nonce, max_age)

    async def verify_access_token(self, access_token: str) -> dict[str, Any]:
        return self._check_access_claims(await self._verify(access_token, KERNEL_AUDIENCE))

    async def user_info(self, access_token: str) -> UserInfo:
        endpoint = self._endpoint(await self.discovery(), "userinfo_endpoint", "/oauth/userinfo")
        response = await self._http.request("GET", endpoint, headers={"authorization": f"Bearer {access_token}"})
        return response.data

    async def revoke(self, token: str, *, token_type_hint: str | None = None) -> None:
        form, headers = self._revoke_form(token, token_type_hint)
        endpoint = self._endpoint(await self.discovery(), "revocation_endpoint", "/oauth/revoke")
        await self._http.request("POST", endpoint, form=form, headers=headers)
