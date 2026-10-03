"""Server clients for the data API v1 (``/service/*``): ``MiRotaract`` (sync)
and ``AsyncMiRotaract`` (async). Both authenticate with client_credentials
and cache the service token until 60 s before it expires."""

from __future__ import annotations

import asyncio
import threading
import time
import uuid
from datetime import datetime
from typing import Any, Mapping, Sequence
from urllib.parse import quote

import httpx

from ._http import AsyncHttp, HttpConfig, Response, SyncHttp
from .auth import check_discovery, client_auth, normalize_issuer, token_set
from .errors import MiRotaractApiError, MiRotaractConfigError
from .pagination import AsyncPaginator, NotModified, Page, PageResult, SyncPaginator
from .types import (
    AuthorityView,
    AuthorizationDecision,
    MemberView,
    OrganizationView,
    PeriodView,
    PersonMembershipView,
    PersonView,
    TokenSet,
)

_enc = lambda value: quote(str(value), safe="")  # noqa: E731
Since = str | datetime | None


def _check_request(
    person_id: str,
    permission: str,
    organization_id: str,
    scope_type: str = "ORGANIZATION",
    period_id: str | None = None,
    resource: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "subjectId": person_id,
        "permission": permission,
        "scope": {"type": scope_type, "organizationId": organization_id},
    }
    if period_id is not None:
        body["periodId"] = period_id
    if resource is not None:
        body["resource"] = dict(resource)
    return body


def _page_from(response: Response, if_none_match: str | None) -> PageResult:
    if response.not_modified:
        return NotModified(etag=response.etag or if_none_match)
    data = response.data or {}
    info = data.get("pageInfo") or {}
    return Page(
        items=list(data.get("items") or []),
        next_cursor=info.get("nextCursor"),
        has_more=bool(info.get("hasMore")),
        etag=response.etag,
    )


class _ClientCore:
    def __init__(
        self,
        base_url: str,
        client_id: str,
        client_secret: str,
        scope: str | Sequence[str] | None,
        client_auth_method: str | None,
        token_endpoint: str | None,
        token_refresh_skew: float,
    ):
        if not base_url:
            raise MiRotaractConfigError("Falta `base_url`.")
        if not client_id:
            raise MiRotaractConfigError("Falta `client_id`.")
        if not client_secret:
            raise MiRotaractConfigError(
                "Falta `client_secret`: el cliente de servidor usa client_credentials. "
                "Para login de personas usá MiRotaractAuth."
            )
        self.base_url = normalize_issuer(base_url)
        self.client_id = client_id
        self._client_secret = client_secret
        self._scope = scope if isinstance(scope, str) or scope is None else " ".join(scope)
        self._client_auth_method = client_auth_method
        self._token_endpoint = token_endpoint
        self._skew = token_refresh_skew
        self._token: TokenSet | None = None
        self._config: dict[str, Any] | None = None

    def _cached_token(self) -> str | None:
        if self._token and time.time() < self._token.expires_at - self._skew:
            return self._token.access_token
        return None

    def _token_form(self) -> tuple[dict[str, str | None], dict[str, str]]:
        form: dict[str, str | None] = {"grant_type": "client_credentials", "scope": self._scope}
        headers = client_auth(self.client_id, self._client_secret, self._client_auth_method, form)
        return form, headers

    @property
    def granted_scopes(self) -> list[str]:
        """Scopes of the current service token (after the first call)."""
        return self._token.scope.split() if self._token else []

    def clear_token(self) -> None:
        self._token = None


# --- sync ----------------------------------------------------------------------


class MiRotaract(_ClientCore):
    """Synchronous server client. Never ship it to a browser or mobile app:
    it holds the client secret."""

    def __init__(
        self,
        base_url: str,
        client_id: str,
        client_secret: str,
        *,
        scope: str | Sequence[str] | None = None,
        client_auth_method: str | None = None,
        token_endpoint: str | None = None,
        token_refresh_skew: float = 60,
        http_client: httpx.Client | None = None,
        max_retries: int = 2,
        timeout: float = 30.0,
        sleep: Any = None,
    ):
        super().__init__(
            base_url, client_id, client_secret, scope, client_auth_method, token_endpoint, token_refresh_skew
        )
        self._http = SyncHttp(HttpConfig(max_retries=max_retries, timeout=timeout), http_client, sleep)
        self._lock = threading.Lock()
        self.clubs = Clubs(self)
        self.organizations = self.clubs
        self.members = Members(self)
        self.persons = Persons(self)
        self.authorities = Authorities(self)
        self.periods = Periods(self)
        self.permissions = Permissions(self)

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> "MiRotaract":
        return self

    def __exit__(self, *exc: Any) -> None:
        self.close()

    def discovery(self) -> dict[str, Any]:
        if self._config is None:
            data = self._http.request("GET", f"{self.base_url}/.well-known/openid-configuration").data
            self._config = check_discovery(self.base_url, data)
        return self._config

    def get_access_token(self, force_refresh: bool = False) -> str:
        """A valid service token (cached; renewed 60 s before it expires)."""
        if not force_refresh and (token := self._cached_token()):
            return token
        with self._lock:
            if not force_refresh and (token := self._cached_token()):
                return token
            endpoint = self._token_endpoint or self.discovery()["token_endpoint"]
            form, headers = self._token_form()
            self._token = token_set(self._http.request("POST", endpoint, form=form, headers=headers, retry_on_rate_limit=True).data)
            return self._token.access_token

    def request(self, method: str, path: str, **kwargs: Any) -> Response:
        """Authenticated request to ``{base_url}{path}``; one retry with a fresh token on 401."""
        headers = dict(kwargs.pop("headers", None) or {})

        def send(token: str) -> Response:
            return self._http.request(
                method, f"{self.base_url}{path}", headers={**headers, "authorization": f"Bearer {token}"}, **kwargs
            )

        try:
            return send(self.get_access_token())
        except MiRotaractApiError as error:
            if error.status != 401:
                raise
            self.clear_token()
            return send(self.get_access_token(force_refresh=True))

    def _paginate(self, path: str, query: dict[str, Any], limit: int | None, if_none_match: str | None) -> SyncPaginator[Any]:
        def fetch(cursor: str | None, etag: str | None) -> PageResult:
            response = self.request(
                "GET",
                path,
                params={**query, "limit": limit, "cursor": cursor},
                headers={"if-none-match": etag} if etag else None,
            )
            return _page_from(response, etag)

        return SyncPaginator(fetch, if_none_match)


class Clubs:
    def __init__(self, client: MiRotaract):
        self._client = client

    def list(
        self,
        *,
        type: str | None = None,
        status: str | None = None,
        parent_id: str | None = None,
        updated_since: Since = None,
        limit: int | None = None,
        if_none_match: str | None = None,
    ) -> SyncPaginator[OrganizationView]:
        """Organizations visible to the app (its own and descendants)."""
        query = {"type": type, "status": status, "parentId": parent_id, "updatedSince": updated_since}
        return self._client._paginate("/service/organizations", query, limit, if_none_match)

    def get(self, organization_id: str) -> OrganizationView:
        return self._client.request("GET", f"/service/organizations/{_enc(organization_id)}").data


class Members:
    def __init__(self, client: MiRotaract):
        self._client = client

    def list(
        self,
        organization_id: str,
        *,
        status: str | None = None,
        updated_since: Since = None,
        limit: int | None = None,
        if_none_match: str | None = None,
    ) -> SyncPaginator[MemberView]:
        """Members of an organization. With ``if_none_match``, ``.page()`` may return ``NotModified``."""
        query = {"status": status, "updatedSince": updated_since}
        return self._client._paginate(
            f"/service/organizations/{_enc(organization_id)}/members", query, limit, if_none_match
        )


class Persons:
    def __init__(self, client: MiRotaract):
        self._client = client

    def get(self, person_id: str) -> PersonView:
        return self._client.request("GET", f"/service/persons/{_enc(person_id)}").data

    def batch(self, ids: Sequence[str]) -> list[PersonView]:
        """Chunks of 100; people outside the app's scope are omitted."""
        unique = list(dict.fromkeys(ids))
        result: list[PersonView] = []
        for start in range(0, len(unique), 100):
            response = self._client.request(
                "POST",
                "/service/persons/batch",
                json={"ids": unique[start : start + 100]},
                idempotency_key=str(uuid.uuid4()),
            )
            result.extend(response.data or [])
        return result

    def memberships(self, person_id: str) -> list[PersonMembershipView]:
        return self._client.request("GET", f"/service/persons/{_enc(person_id)}/memberships").data


class Authorities:
    def __init__(self, client: MiRotaract):
        self._client = client

    def list(self, organization_id: str, *, include_descendants: bool | None = None) -> list[AuthorityView]:
        return self._client.request(
            "GET",
            f"/service/organizations/{_enc(organization_id)}/authorities",
            params={"includeDescendants": include_descendants},
        ).data


class Periods:
    def __init__(self, client: MiRotaract):
        self._client = client

    def list(self, organization_id: str, *, status: str | None = None) -> list[PeriodView]:
        return self._client.request(
            "GET", f"/service/organizations/{_enc(organization_id)}/periods", params={"status": status}
        ).data


class Permissions:
    def __init__(self, client: MiRotaract):
        self._client = client

    def check(
        self,
        *,
        person_id: str,
        permission: str,
        organization_id: str,
        scope_type: str = "ORGANIZATION",
        period_id: str | None = None,
        resource: Mapping[str, Any] | None = None,
    ) -> AuthorizationDecision:
        body = _check_request(person_id, permission, organization_id, scope_type, period_id, resource)
        return self._client.request(
            "POST", "/service/authorization/check", json=body, idempotency_key=str(uuid.uuid4())
        ).data

    def check_many(self, checks: Sequence[Mapping[str, Any]]) -> list[AuthorizationDecision]:
        """Up to 100 checks (dicts with the same keys as ``check``), answered in order."""
        body = {"checks": [_check_request(**check) for check in checks]}
        return self._client.request(
            "POST", "/service/authorization/batch-check", json=body, idempotency_key=str(uuid.uuid4())
        ).data


# --- async ---------------------------------------------------------------------


class AsyncMiRotaract(_ClientCore):
    """Asynchronous server client (same resources, awaitable)."""

    def __init__(
        self,
        base_url: str,
        client_id: str,
        client_secret: str,
        *,
        scope: str | Sequence[str] | None = None,
        client_auth_method: str | None = None,
        token_endpoint: str | None = None,
        token_refresh_skew: float = 60,
        http_client: httpx.AsyncClient | None = None,
        max_retries: int = 2,
        timeout: float = 30.0,
        sleep: Any = None,
    ):
        super().__init__(
            base_url, client_id, client_secret, scope, client_auth_method, token_endpoint, token_refresh_skew
        )
        self._http = AsyncHttp(HttpConfig(max_retries=max_retries, timeout=timeout), http_client, sleep)
        self._lock: asyncio.Lock | None = None
        self.clubs = AsyncClubs(self)
        self.organizations = self.clubs
        self.members = AsyncMembers(self)
        self.persons = AsyncPersons(self)
        self.authorities = AsyncAuthorities(self)
        self.periods = AsyncPeriods(self)
        self.permissions = AsyncPermissions(self)

    async def aclose(self) -> None:
        await self._http.aclose()

    async def __aenter__(self) -> "AsyncMiRotaract":
        return self

    async def __aexit__(self, *exc: Any) -> None:
        await self.aclose()

    async def discovery(self) -> dict[str, Any]:
        if self._config is None:
            data = (await self._http.request("GET", f"{self.base_url}/.well-known/openid-configuration")).data
            self._config = check_discovery(self.base_url, data)
        return self._config

    async def get_access_token(self, force_refresh: bool = False) -> str:
        if not force_refresh and (token := self._cached_token()):
            return token
        if self._lock is None:
            self._lock = asyncio.Lock()
        async with self._lock:
            if not force_refresh and (token := self._cached_token()):
                return token
            endpoint = self._token_endpoint or (await self.discovery())["token_endpoint"]
            form, headers = self._token_form()
            response = await self._http.request("POST", endpoint, form=form, headers=headers, retry_on_rate_limit=True)
            self._token = token_set(response.data)
            return self._token.access_token

    async def request(self, method: str, path: str, **kwargs: Any) -> Response:
        headers = dict(kwargs.pop("headers", None) or {})

        async def send(token: str) -> Response:
            return await self._http.request(
                method, f"{self.base_url}{path}", headers={**headers, "authorization": f"Bearer {token}"}, **kwargs
            )

        try:
            return await send(await self.get_access_token())
        except MiRotaractApiError as error:
            if error.status != 401:
                raise
            self.clear_token()
            return await send(await self.get_access_token(force_refresh=True))

    def _paginate(
        self, path: str, query: dict[str, Any], limit: int | None, if_none_match: str | None
    ) -> AsyncPaginator[Any]:
        async def fetch(cursor: str | None, etag: str | None) -> PageResult:
            response = await self.request(
                "GET",
                path,
                params={**query, "limit": limit, "cursor": cursor},
                headers={"if-none-match": etag} if etag else None,
            )
            return _page_from(response, etag)

        return AsyncPaginator(fetch, if_none_match)


class AsyncClubs:
    def __init__(self, client: AsyncMiRotaract):
        self._client = client

    def list(
        self,
        *,
        type: str | None = None,
        status: str | None = None,
        parent_id: str | None = None,
        updated_since: Since = None,
        limit: int | None = None,
        if_none_match: str | None = None,
    ) -> AsyncPaginator[OrganizationView]:
        query = {"type": type, "status": status, "parentId": parent_id, "updatedSince": updated_since}
        return self._client._paginate("/service/organizations", query, limit, if_none_match)

    async def get(self, organization_id: str) -> OrganizationView:
        return (await self._client.request("GET", f"/service/organizations/{_enc(organization_id)}")).data


class AsyncMembers:
    def __init__(self, client: AsyncMiRotaract):
        self._client = client

    def list(
        self,
        organization_id: str,
        *,
        status: str | None = None,
        updated_since: Since = None,
        limit: int | None = None,
        if_none_match: str | None = None,
    ) -> AsyncPaginator[MemberView]:
        query = {"status": status, "updatedSince": updated_since}
        return self._client._paginate(
            f"/service/organizations/{_enc(organization_id)}/members", query, limit, if_none_match
        )


class AsyncPersons:
    def __init__(self, client: AsyncMiRotaract):
        self._client = client

    async def get(self, person_id: str) -> PersonView:
        return (await self._client.request("GET", f"/service/persons/{_enc(person_id)}")).data

    async def batch(self, ids: Sequence[str]) -> list[PersonView]:
        unique = list(dict.fromkeys(ids))
        result: list[PersonView] = []
        for start in range(0, len(unique), 100):
            response = await self._client.request(
                "POST",
                "/service/persons/batch",
                json={"ids": unique[start : start + 100]},
                idempotency_key=str(uuid.uuid4()),
            )
            result.extend(response.data or [])
        return result

    async def memberships(self, person_id: str) -> list[PersonMembershipView]:
        return (await self._client.request("GET", f"/service/persons/{_enc(person_id)}/memberships")).data


class AsyncAuthorities:
    def __init__(self, client: AsyncMiRotaract):
        self._client = client

    async def list(self, organization_id: str, *, include_descendants: bool | None = None) -> list[AuthorityView]:
        response = await self._client.request(
            "GET",
            f"/service/organizations/{_enc(organization_id)}/authorities",
            params={"includeDescendants": include_descendants},
        )
        return response.data


class AsyncPeriods:
    def __init__(self, client: AsyncMiRotaract):
        self._client = client

    async def list(self, organization_id: str, *, status: str | None = None) -> list[PeriodView]:
        response = await self._client.request(
            "GET", f"/service/organizations/{_enc(organization_id)}/periods", params={"status": status}
        )
        return response.data


class AsyncPermissions:
    def __init__(self, client: AsyncMiRotaract):
        self._client = client

    async def check(
        self,
        *,
        person_id: str,
        permission: str,
        organization_id: str,
        scope_type: str = "ORGANIZATION",
        period_id: str | None = None,
        resource: Mapping[str, Any] | None = None,
    ) -> AuthorizationDecision:
        body = _check_request(person_id, permission, organization_id, scope_type, period_id, resource)
        response = await self._client.request(
            "POST", "/service/authorization/check", json=body, idempotency_key=str(uuid.uuid4())
        )
        return response.data

    async def check_many(self, checks: Sequence[Mapping[str, Any]]) -> list[AuthorizationDecision]:
        body = {"checks": [_check_request(**check) for check in checks]}
        response = await self._client.request(
            "POST", "/service/authorization/batch-check", json=body, idempotency_key=str(uuid.uuid4())
        )
        return response.data
