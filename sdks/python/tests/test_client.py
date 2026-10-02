from __future__ import annotations

import asyncio
import base64
from datetime import datetime, timezone

import pytest
from conftest import CLIENT_ID, CLIENT_SECRET, ISSUER, FakeKernel, async_no_sleep, no_sleep

from mirotaract import (
    AsyncMiRotaract,
    MiRotaract,
    MiRotaractApiError,
    MiRotaractConfigError,
    MiRotaractOAuthError,
    NotModified,
)


def org(id_: str) -> dict:
    return {
        "id": id_,
        "type": "CLUB",
        "code": id_,
        "name": f"Club {id_}",
        "slug": id_,
        "status": "ACTIVE",
        "parentId": "d1",
        "updatedAt": "2026-01-01T00:00:00Z",
    }


def member(id_: str) -> dict:
    return {
        "membershipId": id_,
        "organizationId": "c1",
        "personId": f"p_{id_}",
        "status": "ACTIVE",
        "person": {"id": f"p_{id_}", "displayName": id_, "firstName": id_, "lastName": id_, "updatedAt": "x"},
        "updatedAt": "x",
    }


def make(kernel: FakeKernel, **kwargs) -> MiRotaract:
    return MiRotaract(
        ISSUER + "/",
        CLIENT_ID,
        kwargs.pop("client_secret", CLIENT_SECRET),
        http_client=kernel.sync_client(),
        sleep=no_sleep,
        **kwargs,
    )


def make_async(kernel: FakeKernel, **kwargs) -> AsyncMiRotaract:
    return AsyncMiRotaract(
        ISSUER,
        CLIENT_ID,
        kwargs.pop("client_secret", CLIENT_SECRET),
        http_client=kernel.async_client(),
        sleep=async_no_sleep,
        **kwargs,
    )


def paged_orgs(kernel: FakeKernel) -> None:
    def handler(r):
        cursor = r.url.params.get("cursor")
        if cursor is None:
            return 200, {"items": [org("a"), org("b")], "pageInfo": {"nextCursor": "p2", "hasMore": True}}
        if cursor == "p2":
            return 200, {"items": [org("c")], "pageInfo": {"nextCursor": "p3", "hasMore": True}}
        return 200, {"items": [org("d")], "pageInfo": {"nextCursor": None, "hasMore": False}}

    kernel.on("GET", "/service/organizations", handler)


def test_token_is_cached_and_uses_basic_auth(kernel):
    kernel.on("GET", "/service/organizations/:id", lambda r: (200, org(r.path.split("/")[-1])))
    client = make(kernel)
    client.clubs.get("c1")
    client.clubs.get("c2")
    token_calls = kernel.calls_to("POST", "/oauth/token")
    assert len(token_calls) == 1
    assert token_calls[0].form["grant_type"] == "client_credentials"
    expected = "Basic " + base64.b64encode(f"{CLIENT_ID}:{CLIENT_SECRET}".encode()).decode()
    assert token_calls[0].headers["authorization"] == expected
    assert kernel.calls_to("GET", "/service/organizations/c1")[0].headers["authorization"] == "Bearer svc_1"
    assert client.granted_scopes == ["kernel.service.organizations.read", "kernel.service.memberships.read"]


def test_token_renewed_within_60s_of_expiry(kernel):
    kernel.token_expires_in = 50
    kernel.on("GET", "/service/organizations/:id", lambda r: (200, org("c1")))
    client = make(kernel)
    client.clubs.get("c1")
    client.clubs.get("c1")
    assert len(kernel.calls_to("POST", "/oauth/token")) == 2


def test_401_refreshes_token_once(kernel):
    state = {"n": 0}

    def handler(r):
        state["n"] += 1
        if state["n"] == 1:
            return 401, {"status": 401, "code": "KERNEL_HTTP_401", "detail": "Invalid service token"}
        return 200, org("c1")

    kernel.on("GET", "/service/organizations/:id", handler)
    assert make(kernel).clubs.get("c1")["id"] == "c1"
    assert len(kernel.calls_to("POST", "/oauth/token")) == 2


def test_client_secret_post_and_scope(kernel):
    client = make(kernel, client_auth_method="client_secret_post", scope=["a", "b"])
    client.get_access_token()
    call = kernel.calls_to("POST", "/oauth/token")[0]
    assert "authorization" not in call.headers
    assert call.form["client_id"] == CLIENT_ID and call.form["client_secret"] == CLIENT_SECRET
    assert call.form["scope"] == "a b"


def test_invalid_secret_raises_invalid_client(kernel):
    with pytest.raises(MiRotaractOAuthError) as info:
        make(kernel, client_secret="mrs_wrong").clubs.get("c1")
    assert info.value.error == "invalid_client"


def test_clubs_list_follows_cursor_and_sends_filters(kernel):
    paged_orgs(kernel)
    client = make(kernel)
    since = datetime(2026, 1, 1, tzinfo=timezone.utc)
    ids = [o["id"] for o in client.clubs.list(status="ACTIVE", type="CLUB", limit=2, updated_since=since)]
    assert ids == ["a", "b", "c", "d"]
    params = kernel.calls_to("GET", "/service/organizations")[0].url.params
    assert params["status"] == "ACTIVE" and params["type"] == "CLUB" and params["limit"] == "2"
    assert params["updatedSince"] == "2026-01-01T00:00:00Z"
    assert "cursor" not in params
    assert len(client.clubs.list().all()) == 4
    assert len(client.clubs.list().all(max=3)) == 3
    page = client.clubs.list().page()
    assert not page.not_modified and len(page.items) == 2 and page.next_cursor == "p2" and page.has_more


def test_members_pagination_and_etag(kernel):
    def handler(r):
        if r.headers.get("if-none-match") == 'W/"v1"':
            return 304, None, {"etag": 'W/"v1"'}
        if r.url.params.get("cursor") == "n":
            return 200, {"items": [member("m3")], "pageInfo": {"nextCursor": None, "hasMore": False}}
        return (
            200,
            {"items": [member("m1"), member("m2")], "pageInfo": {"nextCursor": "n", "hasMore": True}},
            {"etag": 'W/"v1"'},
        )

    kernel.on("GET", "/service/organizations/c1/members", handler)
    client = make(kernel)
    members = client.members.list("c1", limit=2, updated_since="2026-01-01T00:00:00Z", status="ACTIVE").all()
    assert [m["membershipId"] for m in members] == ["m1", "m2", "m3"]
    params = kernel.calls_to("GET", "/service/organizations/c1/members")[0].url.params
    assert params["updatedSince"] == "2026-01-01T00:00:00Z" and params["status"] == "ACTIVE"
    first = client.members.list("c1").page()
    assert first.etag == 'W/"v1"'
    again = client.members.list("c1", if_none_match=first.etag).page()
    assert isinstance(again, NotModified) and again.not_modified and again.etag == 'W/"v1"'
    paginator = client.members.list("c1", if_none_match='W/"v1"')
    assert paginator.all() == [] and paginator.not_modified


def test_persons_get_batch_memberships(kernel):
    kernel.on(
        "GET",
        "/service/persons/:id",
        lambda r: (200, {"id": r.url.raw_path.decode().split("/")[-1], "displayName": "Ana"}),
    )
    kernel.on(
        "GET",
        "/service/persons/:id/memberships",
        lambda r: (200, [{"membershipId": "m", "organizationId": "c1", "status": "ACTIVE"}]),
    )
    kernel.on("POST", "/service/persons/batch", lambda r: (200, [{"id": i} for i in r.json["ids"]]))
    client = make(kernel)
    assert client.persons.get("p 1")["id"] == "p%201"
    assert client.persons.memberships("p1")[0]["organizationId"] == "c1"
    people = client.persons.batch([f"p{i}" for i in range(250)] + ["p0"])
    assert len(people) == 250
    calls = kernel.calls_to("POST", "/service/persons/batch")
    assert [len(c.json["ids"]) for c in calls] == [100, 100, 50]
    assert all(c.headers.get("idempotency-key") for c in calls)


def test_authorities_and_periods(kernel):
    kernel.on("GET", "/service/organizations/d1/authorities", lambda r: (200, [{"appointmentId": "a1"}]))
    kernel.on("GET", "/service/organizations/d1/periods", lambda r: (200, [{"id": "per1"}]))
    client = make(kernel)
    assert client.authorities.list("d1", include_descendants=True)[0]["appointmentId"] == "a1"
    assert kernel.calls_to("GET", "/service/organizations/d1/authorities")[0].url.params["includeDescendants"] == "true"
    assert client.periods.list("d1", status="ACTIVE")[0]["id"] == "per1"
    assert kernel.calls_to("GET", "/service/organizations/d1/periods")[0].url.params["status"] == "ACTIVE"


def test_permissions_check_and_check_many(kernel):
    kernel.on(
        "POST",
        "/service/authorization/check",
        lambda r: (200, {"allowed": True, "subjectId": r.json["subjectId"], "permission": r.json["permission"]}),
    )
    kernel.on(
        "POST",
        "/service/authorization/batch-check",
        lambda r: (200, [{"allowed": False} for _ in r.json["checks"]]),
    )
    client = make(kernel)
    decision = client.permissions.check(person_id="p1", permission="meetings.meeting.create", organization_id="c1")
    assert decision["allowed"] is True
    assert kernel.calls_to("POST", "/service/authorization/check")[0].json == {
        "subjectId": "p1",
        "permission": "meetings.meeting.create",
        "scope": {"type": "ORGANIZATION", "organizationId": "c1"},
    }
    many = client.permissions.check_many(
        [
            {"person_id": "p1", "permission": "x", "organization_id": "c1"},
            {"person_id": "p2", "permission": "x", "organization_id": "c1", "scope_type": "ORGANIZATION_TREE"},
        ]
    )
    assert len(many) == 2
    checks = kernel.calls_to("POST", "/service/authorization/batch-check")[0].json["checks"]
    assert checks[1]["scope"]["type"] == "ORGANIZATION_TREE"


def test_out_of_scope_is_api_error_403(kernel):
    kernel.on(
        "GET",
        "/service/organizations/:id/members",
        lambda r: (403, {"status": 403, "code": "KERNEL_HTTP_403", "detail": "Fuera del alcance de esta app"}),
    )
    with pytest.raises(MiRotaractApiError) as info:
        make(kernel).members.list("other").all()
    assert info.value.status == 403 and info.value.detail == "Fuera del alcance de esta app"


def test_requires_configuration():
    with pytest.raises(MiRotaractConfigError):
        MiRotaract("", "x", "y")
    with pytest.raises(MiRotaractConfigError):
        MiRotaract(ISSUER, "x", "")


def test_async_client_resources(kernel):
    paged_orgs(kernel)
    kernel.on("GET", "/service/organizations/c1/members", lambda r: (304, None, {"etag": 'W/"v"'}))
    kernel.on("POST", "/service/persons/batch", lambda r: (200, [{"id": i} for i in r.json["ids"]]))
    kernel.on("GET", "/service/organizations/c1/periods", lambda r: (200, [{"id": "per"}]))
    kernel.on("GET", "/service/organizations/c1/authorities", lambda r: (200, []))
    kernel.on("GET", "/service/persons/:id/memberships", lambda r: (200, []))
    kernel.on("POST", "/service/authorization/check", lambda r: (200, {"allowed": True}))

    async def main():
        async with make_async(kernel) as client:
            ids = [o["id"] async for o in client.clubs.list(limit=2)]
            assert ids == ["a", "b", "c", "d"]
            assert len(await client.clubs.list().all()) == 4
            page = await client.members.list("c1", if_none_match='W/"v"').page()
            assert isinstance(page, NotModified)
            assert len(await client.persons.batch(["a", "b"])) == 2
            assert (await client.periods.list("c1"))[0]["id"] == "per"
            assert await client.authorities.list("c1", include_descendants=False) == []
            assert await client.persons.memberships("p1") == []
            check = await client.permissions.check(person_id="p", permission="x", organization_id="c1")
            assert check["allowed"]
            await asyncio.gather(*(client.get_access_token() for _ in range(5)))

    asyncio.run(main())
    assert len(kernel.calls_to("POST", "/oauth/token")) == 1


def test_async_invalid_secret(kernel):
    async def main():
        await make_async(kernel, client_secret="bad").clubs.get("c1")

    with pytest.raises(MiRotaractOAuthError):
        asyncio.run(main())
