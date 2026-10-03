"""httpx wrapper shared by the sync and async clients: typed errors, retries
with exponential backoff + jitter on 429/502/503/504 honoring Retry-After.
A POST/PATCH is only retried when it carries an Idempotency-Key."""

from __future__ import annotations

import asyncio
import random
import time
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any, Awaitable, Callable, Mapping

import httpx

from .errors import MiRotaractError, error_from_response

SDK_VERSION = "0.1.0"
RETRYABLE_STATUS = frozenset({429, 502, 503, 504})
SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS", "PUT", "DELETE"})


@dataclass
class HttpConfig:
    max_retries: int = 2
    retry_base_delay: float = 0.3
    max_retry_delay: float = 30.0
    timeout: float = 30.0
    user_agent: str = f"mirotaract-sdk-python/{SDK_VERSION}"


@dataclass
class Response:
    status: int
    headers: httpx.Headers
    data: Any
    etag: str | None = None
    not_modified: bool = False


@dataclass
class _Prepared:
    method: str
    url: str
    params: dict[str, str] = field(default_factory=dict)
    headers: dict[str, str] = field(default_factory=dict)
    content: bytes | None = None
    retryable: bool = False
    # Non-idempotent request that may be retried on 429 only (the token
    # endpoint: the Kernel counts the quota before handling the grant).
    retry_on_rate_limit: bool = False


def _query_value(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat().replace("+00:00", "Z")
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


def parse_retry_after(value: str | None, now: float | None = None) -> float | None:
    """Seconds or HTTP-date (RFC 9110 §10.2.3) → seconds to wait."""
    if not value:
        return None
    value = value.strip()
    try:
        return max(0.0, float(value))
    except ValueError:
        pass
    try:
        when = parsedate_to_datetime(value)
    except (TypeError, ValueError):
        return None
    if when is None:
        return None
    current = time.time() if now is None else now
    return max(0.0, when.timestamp() - current)


def prepare(
    method: str,
    url: str,
    *,
    params: Mapping[str, Any] | None = None,
    headers: Mapping[str, str] | None = None,
    json: Any = None,
    form: Mapping[str, str | None] | None = None,
    idempotency_key: str | None = None,
    retry_on_rate_limit: bool = False,
    user_agent: str,
) -> _Prepared:
    import json as _json
    from urllib.parse import urlencode

    prepared = _Prepared(method=method.upper(), url=url)
    prepared.params = {k: _query_value(v) for k, v in (params or {}).items() if v is not None}
    prepared.headers = {"accept": "application/json", "user-agent": user_agent}
    prepared.headers.update({k.lower(): v for k, v in (headers or {}).items()})
    if form is not None:
        prepared.content = urlencode({k: v for k, v in form.items() if v is not None}).encode()
        prepared.headers["content-type"] = "application/x-www-form-urlencoded"
    elif json is not None:
        prepared.content = _json.dumps(json).encode()
        prepared.headers["content-type"] = "application/json"
    if idempotency_key:
        prepared.headers["idempotency-key"] = idempotency_key
    prepared.retryable = prepared.method in SAFE_METHODS or bool(idempotency_key)
    prepared.retry_on_rate_limit = retry_on_rate_limit
    return prepared


def _backoff(config: HttpConfig, attempt: int) -> float:
    exp = min(config.max_retry_delay, config.retry_base_delay * 2**attempt)
    return exp / 2 + random.random() * exp / 2


def _retry_wait(config: HttpConfig, prepared: _Prepared, attempt: int, response: httpx.Response) -> float | None:
    if response.status_code not in RETRYABLE_STATUS or attempt >= config.max_retries:
        return None
    if not prepared.retryable and not (response.status_code == 429 and prepared.retry_on_rate_limit):
        return None
    retry_after = parse_retry_after(response.headers.get("retry-after"))
    wait = retry_after if retry_after is not None else _backoff(config, attempt)
    return wait if wait <= config.max_retry_delay else None


def finish(response: httpx.Response) -> Response:
    etag = response.headers.get("etag")
    if response.status_code == 304:
        return Response(304, response.headers, None, etag, True)
    data: Any = None
    if response.status_code != 204 and response.content:
        try:
            data = response.json()
        except ValueError:
            data = response.text
    if response.status_code >= 400:
        raise error_from_response(response.status_code, data, response.headers)
    return Response(response.status_code, response.headers, data, etag, False)


def _network_error(prepared: _Prepared, error: Exception) -> MiRotaractError:
    origin = httpx.URL(prepared.url)
    return MiRotaractError(f"No se pudo conectar con {origin.scheme}://{origin.host}: {error}")


class SyncHttp:
    def __init__(
        self,
        config: HttpConfig,
        client: httpx.Client | None = None,
        sleep: Callable[[float], None] | None = None,
    ):
        self.config = config
        self._owns_client = client is None
        self.client = client or httpx.Client(timeout=config.timeout)
        self._sleep = sleep or time.sleep

    def request(self, method: str, url: str, **kwargs: Any) -> Response:
        prepared = prepare(method, url, user_agent=self.config.user_agent, **kwargs)
        attempt = 0
        while True:
            try:
                response = self.client.request(
                    prepared.method,
                    prepared.url,
                    params=prepared.params,
                    headers=prepared.headers,
                    content=prepared.content,
                )
            except httpx.TransportError as error:
                if prepared.retryable and attempt < self.config.max_retries:
                    self._sleep(_backoff(self.config, attempt))
                    attempt += 1
                    continue
                raise _network_error(prepared, error) from error
            wait = _retry_wait(self.config, prepared, attempt, response)
            if wait is not None:
                response.close()
                self._sleep(wait)
                attempt += 1
                continue
            return finish(response)

    def close(self) -> None:
        if self._owns_client:
            self.client.close()


class AsyncHttp:
    def __init__(
        self,
        config: HttpConfig,
        client: httpx.AsyncClient | None = None,
        sleep: Callable[[float], Awaitable[None]] | None = None,
    ):
        self.config = config
        self._owns_client = client is None
        self.client = client or httpx.AsyncClient(timeout=config.timeout)
        self._sleep = sleep or asyncio.sleep

    async def request(self, method: str, url: str, **kwargs: Any) -> Response:
        prepared = prepare(method, url, user_agent=self.config.user_agent, **kwargs)
        attempt = 0
        while True:
            try:
                response = await self.client.request(
                    prepared.method,
                    prepared.url,
                    params=prepared.params,
                    headers=prepared.headers,
                    content=prepared.content,
                )
            except httpx.TransportError as error:
                if prepared.retryable and attempt < self.config.max_retries:
                    await self._sleep(_backoff(self.config, attempt))
                    attempt += 1
                    continue
                raise _network_error(prepared, error) from error
            wait = _retry_wait(self.config, prepared, attempt, response)
            if wait is not None:
                await response.aclose()
                await self._sleep(wait)
                attempt += 1
                continue
            return finish(response)

    async def aclose(self) -> None:
        if self._owns_client:
            await self.client.aclose()


def basic_auth(client_id: str, client_secret: str) -> str:
    """RFC 6749 §2.3.1: each part form-urlencoded before base64."""
    import base64
    from urllib.parse import quote

    raw = f"{quote(client_id, safe='')}:{quote(client_secret, safe='')}".encode()
    return "Basic " + base64.b64encode(raw).decode()
