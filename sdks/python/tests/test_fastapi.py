from __future__ import annotations

from conftest import CLIENT_ID, ISSUER, REDIRECT_URI, FakeKernel, async_no_sleep, no_sleep
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from mirotaract import AsyncMiRotaractAuth, MiRotaractAuth
from mirotaract.fastapi import require_user


def app_with(dependency) -> TestClient:
    app = FastAPI()

    @app.get("/me")
    async def me(user=Depends(dependency)):
        return {"sub": user["sub"]}

    return TestClient(app)


def userinfo_route(kernel: FakeKernel) -> None:
    kernel.on(
        "GET",
        "/oauth/userinfo",
        lambda r: (200, {"sub": "person_1", "memberships": [{"organizationId": "c1"}]})
        if r.headers.get("authorization") == "Bearer good"
        else (401, {"error": "invalid_token"}),
    )


def async_auth(kernel: FakeKernel) -> AsyncMiRotaractAuth:
    return AsyncMiRotaractAuth(
        ISSUER, CLIENT_ID, REDIRECT_URI, http_client=kernel.async_client(), sleep=async_no_sleep
    )


def test_missing_and_invalid_token_are_401(kernel):
    userinfo_route(kernel)
    client = app_with(require_user(async_auth(kernel)))
    missing = client.get("/me")
    assert missing.status_code == 401
    assert missing.headers["www-authenticate"].startswith('Bearer error="invalid_token"')
    assert client.get("/me", headers={"authorization": "Bearer bad"}).status_code == 401


def test_valid_token_returns_user_and_is_cached(kernel):
    userinfo_route(kernel)
    client = app_with(require_user(async_auth(kernel)))
    for _ in range(3):
        response = client.get("/me", headers={"authorization": "Bearer good"})
        assert response.json() == {"sub": "person_1"}
    assert len(kernel.calls_to("GET", "/oauth/userinfo")) == 1


def test_jwt_mode_with_sync_auth(kernel):
    auth = MiRotaractAuth(ISSUER, CLIENT_ID, REDIRECT_URI, http_client=kernel.sync_client(), sleep=no_sleep)
    token = kernel.sign({"client_id": CLIENT_ID, "token_use": "user"}, audience="institutional-kernel")
    client = app_with(require_user(auth, verify="jwt"))
    assert client.get("/me", headers={"authorization": f"Bearer {token}"}).json() == {"sub": "person_1"}
    assert client.get("/me", headers={"authorization": "Bearer a.b.c"}).status_code == 401
    assert kernel.calls_to("GET", "/oauth/userinfo") == []


def test_authorize_hook_403(kernel):
    userinfo_route(kernel)
    dependency = require_user(
        async_auth(kernel),
        authorize=lambda user: any(m["organizationId"] == "c2" for m in user.get("memberships", [])),
    )
    assert app_with(dependency).get("/me", headers={"authorization": "Bearer good"}).status_code == 403
