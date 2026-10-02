from __future__ import annotations

import asyncio
import base64
import hashlib
import time
from urllib.parse import parse_qs, urlsplit

import pytest
from conftest import CLIENT_ID, CLIENT_SECRET, ISSUER, REDIRECT_URI, FakeKernel, async_no_sleep, no_sleep

from mirotaract import AsyncMiRotaractAuth, MiRotaractAuth, MiRotaractConfigError, MiRotaractOAuthError


def make(kernel: FakeKernel, secret: str | None = CLIENT_SECRET, **kwargs) -> MiRotaractAuth:
    return MiRotaractAuth(
        ISSUER, CLIENT_ID, REDIRECT_URI, secret, http_client=kernel.sync_client(), sleep=no_sleep, **kwargs
    )


def oidc_token_route(kernel: FakeKernel, nonce: str | None = None) -> None:
    def handler(r):
        grant = r.form.get("grant_type")
        if grant == "authorization_code" and r.form.get("code") != "mrc_good":
            return 400, {"error": "invalid_grant", "error_description": "Invalid authorization code"}
        if grant == "refresh_token" and r.form.get("refresh_token") != "mrr_1":
            return 400, {"error": "invalid_grant"}
        id_claims = {"azp": CLIENT_ID, "name": "Ana Pérez", "auth_time": int(time.time())}
        if grant == "authorization_code" and nonce:
            id_claims["nonce"] = nonce
        return 200, {
            "access_token": kernel.sign(
                {"client_id": CLIENT_ID, "azp": CLIENT_ID, "token_use": "user", "scope": "openid profile"},
                audience="institutional-kernel",
            ),
            "token_type": "Bearer",
            "expires_in": 600,
            "scope": "openid profile",
            "id_token": kernel.sign(id_claims),
            "refresh_token": "mrr_2" if grant == "refresh_token" else "mrr_1",
        }

    kernel.on("POST", "/oauth/token", handler)


def test_authorization_url_pkce(kernel):
    auth = make(kernel)
    request = auth.authorization_url(scope=["openid", "profile", "memberships"])
    parts = urlsplit(request.url)
    assert f"{parts.scheme}://{parts.netloc}{parts.path}" == "https://web.test/oauth/authorize"
    q = {k: v[0] for k, v in parse_qs(parts.query).items()}
    assert q["response_type"] == "code" and q["client_id"] == CLIENT_ID and q["redirect_uri"] == REDIRECT_URI
    assert q["scope"] == "openid profile memberships" and q["code_challenge_method"] == "S256"
    assert q["state"] == request.state and q["nonce"] == request.nonce
    assert 43 <= len(request.code_verifier) <= 128
    expected = base64.urlsafe_b64encode(hashlib.sha256(request.code_verifier.encode()).digest()).rstrip(b"=")
    assert q["code_challenge"] == expected.decode()
    other = auth.authorization_url(state="s1", nonce="n1")
    assert (other.state, other.nonce) == ("s1", "n1") and other.code_verifier != request.code_verifier
    assert parse_qs(urlsplit(other.url).query)["scope"] == ["openid profile email"]


def test_exchange_code_verifies_id_token(kernel):
    oidc_token_route(kernel, nonce="n-1")
    tokens = make(kernel).exchange_code("mrc_good", "v" * 43, nonce="n-1")
    assert tokens.claims["sub"] == "person_1" and tokens.claims["name"] == "Ana Pérez"
    assert tokens.refresh_token == "mrr_1" and tokens.expires_at > time.time()
    call = kernel.calls_to("POST", "/oauth/token")[0]
    assert call.form["code_verifier"] == "v" * 43 and call.form["redirect_uri"] == REDIRECT_URI
    assert call.headers["authorization"].startswith("Basic ")


def test_exchange_code_errors(kernel):
    oidc_token_route(kernel, nonce="n-1")
    auth = make(kernel)
    with pytest.raises(MiRotaractOAuthError) as info:
        auth.exchange_code("mrc_good", "v" * 43, nonce="other")
    assert info.value.error == "invalid_token"
    with pytest.raises(MiRotaractOAuthError) as info:
        auth.exchange_code("mrc_bad", "v" * 43)
    assert info.value.error == "invalid_grant" and info.value.status == 400


def test_public_client_sends_client_id_in_body(kernel):
    def handler(r):
        assert "authorization" not in r.headers
        assert r.form["client_id"] == CLIENT_ID and "client_secret" not in r.form
        return 200, {"access_token": "at", "token_type": "Bearer", "expires_in": 600, "id_token": kernel.sign()}

    kernel.on("POST", "/oauth/token", handler)
    assert make(kernel, secret=None).exchange_code("c", "v" * 43).claims["sub"] == "person_1"


@pytest.mark.parametrize(
    "kwargs",
    [
        {"audience": "someone-else"},
        {"issuer": "https://evil.test"},
        {"expires_in": -120},
        {"claims": {"azp": "mra_other"}},
    ],
)
def test_verify_id_token_rejects(kernel, kwargs):
    token = kernel.sign(**kwargs)
    with pytest.raises(MiRotaractOAuthError) as info:
        make(kernel).verify_id_token(token)
    assert info.value.error == "invalid_token"


def test_verify_id_token_nonce_and_garbage(kernel):
    auth = make(kernel)
    assert auth.verify_id_token(kernel.sign({"nonce": "n"}), nonce="n")["nonce"] == "n"
    with pytest.raises(MiRotaractOAuthError):
        auth.verify_id_token(kernel.sign({"nonce": "n"}), nonce="x")
    with pytest.raises(MiRotaractOAuthError):
        auth.verify_id_token("not-a-jwt")


def test_verify_id_token_max_age(kernel):
    auth = make(kernel)
    old = kernel.sign({"auth_time": int(time.time()) - 3600})
    with pytest.raises(MiRotaractOAuthError):
        auth.verify_id_token(old, max_age=300)
    assert auth.verify_id_token(old, max_age=7200)


def test_jwks_cached_and_refetched_on_new_kid(kernel):
    auth = make(kernel, jwks_cooldown=0)
    auth.verify_id_token(kernel.sign())
    auth.verify_id_token(kernel.sign())
    assert len(kernel.calls_to("GET", "/.well-known/jwks.json")) == 1
    kernel.add_key("k2")
    auth.verify_id_token(kernel.sign(kid="k2"))
    assert len(kernel.calls_to("GET", "/.well-known/jwks.json")) == 2
    assert len(kernel.calls_to("GET", "/.well-known/openid-configuration")) == 1


def test_refresh_rotates(kernel):
    oidc_token_route(kernel)
    auth = make(kernel)
    tokens = auth.refresh("mrr_1")
    assert tokens.refresh_token == "mrr_2" and tokens.claims["sub"] == "person_1"
    with pytest.raises(MiRotaractOAuthError) as info:
        auth.refresh("mrr_reused")
    assert info.value.error == "invalid_grant"


def test_user_info_and_revoke(kernel):
    kernel.on(
        "GET",
        "/oauth/userinfo",
        lambda r: (200, {"sub": "person_1", "email": "ana@example.test"})
        if r.headers.get("authorization") == "Bearer good"
        else (401, {"error": "invalid_token"}),
    )
    kernel.on("POST", "/oauth/revoke", lambda r: (200, {}))
    auth = make(kernel)
    assert auth.user_info("good")["email"] == "ana@example.test"
    with pytest.raises(MiRotaractOAuthError) as info:
        auth.user_info("bad")
    assert info.value.error == "invalid_token"
    auth.revoke("mrr_1", token_type_hint="refresh_token")
    call = kernel.calls_to("POST", "/oauth/revoke")[0]
    assert call.form == {"token": "mrr_1", "token_type_hint": "refresh_token"}
    assert call.headers["authorization"].startswith("Basic ")


def test_verify_access_token(kernel):
    auth = make(kernel)
    good = kernel.sign({"client_id": CLIENT_ID, "token_use": "user"}, audience="institutional-kernel")
    assert auth.verify_access_token(good)["sub"] == "person_1"
    for bad in [
        kernel.sign({"client_id": CLIENT_ID, "token_use": "service"}, audience="institutional-kernel"),
        kernel.sign({"client_id": "mra_x", "azp": "mra_x", "token_use": "user"}, audience="institutional-kernel"),
        kernel.sign({"client_id": CLIENT_ID, "token_use": "user"}),
    ]:
        with pytest.raises(MiRotaractOAuthError):
            auth.verify_access_token(bad)


def test_parse_callback(kernel):
    auth = make(kernel)
    assert auth.parse_callback("https://app.test/callback?code=c1&state=s1", "s1") == "c1"
    with pytest.raises(MiRotaractOAuthError) as info:
        auth.parse_callback("https://app.test/callback?code=c1&state=evil", "s1")
    assert info.value.error == "invalid_state"
    with pytest.raises(MiRotaractOAuthError) as info:
        auth.parse_callback("/callback?error=access_denied&state=s1", "s1")
    assert info.value.error == "access_denied"


def test_discovery_issuer_mismatch(kernel):
    auth = MiRotaractAuth("https://kernel.test/api/kernel/v1/", CLIENT_ID, REDIRECT_URI, http_client=kernel.sync_client())
    assert auth.discovery()["issuer"] == ISSUER
    kernel.on("GET", "/.well-known/openid-configuration", lambda r: (200, {"issuer": "https://other.test"}))
    with pytest.raises(MiRotaractConfigError):
        make(kernel).discovery()


def test_async_auth_flow(kernel):
    oidc_token_route(kernel, nonce="n")
    kernel.on("GET", "/oauth/userinfo", lambda r: (200, {"sub": "person_1"}))
    kernel.on("POST", "/oauth/revoke", lambda r: (200, {}))

    async def main():
        async with AsyncMiRotaractAuth(
            ISSUER, CLIENT_ID, REDIRECT_URI, CLIENT_SECRET, http_client=kernel.async_client(), sleep=async_no_sleep
        ) as auth:
            request = await auth.authorization_url()
            assert request.url.startswith("https://web.test/oauth/authorize?")
            tokens = await auth.exchange_code("mrc_good", "v" * 43, nonce="n")
            assert tokens.claims["nonce"] == "n"
            refreshed = await auth.refresh(tokens.refresh_token)
            assert refreshed.refresh_token == "mrr_2"
            assert (await auth.user_info(tokens.access_token))["sub"] == "person_1"
            assert (await auth.verify_access_token(tokens.access_token))["token_use"] == "user"
            await auth.revoke(refreshed.refresh_token)

    asyncio.run(main())
