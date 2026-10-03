from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import httpx
import pytest

from mirotaract._http import AsyncHttp, HttpConfig, SyncHttp, parse_retry_after
from mirotaract.errors import (
    MiRotaractApiError,
    MiRotaractError,
    MiRotaractOAuthError,
    MiRotaractRateLimitError,
)


def scripted(steps):
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        step = steps[min(len(calls) - 1, len(steps) - 1)]
        if isinstance(step, Exception):
            raise step
        status, body, headers = (step + ({},))[:3] if len(step) == 2 else step
        if body is None:
            return httpx.Response(status, headers=headers)
        return httpx.Response(status, json=body, headers=headers)

    waits: list[float] = []
    http = SyncHttp(HttpConfig(), httpx.Client(transport=httpx.MockTransport(handler)), waits.append)
    return http, calls, waits


def test_get_is_retried_on_503_and_502():
    http, calls, waits = scripted([(503, None), (502, None), (200, {"ok": True})])
    assert http.request("GET", "https://x.test/a").data == {"ok": True}
    assert len(calls) == 3 and len(waits) == 2


def test_retry_after_seconds_is_honored():
    http, _, waits = scripted([(429, None, {"retry-after": "2"}), (200, {})])
    http.request("GET", "https://x.test/a")
    assert waits == [2.0]


def test_retry_after_too_long_fails_fast():
    http, calls, _ = scripted([(429, {"status": 429, "code": "RATE"}, {"retry-after": "120"})])
    with pytest.raises(MiRotaractApiError):
        http.request("GET", "https://x.test/a")
    assert len(calls) == 1


# --- E11.3: per-app quotas (docs/developers/limites.md) ------------------

RATE_LIMITED = (
    429,
    {
        "status": 429,
        "code": "KERNEL_RATE_LIMITED",
        "title": "Request failed",
        "detail": "La app superó su límite de 2 pedidos por minuto.",
        "traceId": "abc",
    },
    {
        "retry-after": "3",
        "ratelimit-policy": '"minute";q=2;w=60, "day";q=1000;w=86400',
        "ratelimit": '"minute";r=0;t=3, "day";r=990;t=40000',
    },
)


def test_429_after_retries_is_a_typed_rate_limit_error():
    http, calls, waits = scripted([RATE_LIMITED])
    with pytest.raises(MiRotaractRateLimitError) as caught:
        http.request("GET", "https://x.test/a")
    error = caught.value
    assert isinstance(error, MiRotaractApiError)
    assert error.status == 429 and error.code == "KERNEL_RATE_LIMITED"
    assert error.retry_after == 3.0
    assert error.trace_id == "abc"
    assert '"minute";q=2;w=60' in (error.rate_limit_policy or "")
    assert "r=0" in (error.rate_limit or "")
    assert waits == [3.0, 3.0] and len(calls) == 3


def test_429_over_the_cap_fails_fast_with_the_typed_error():
    status, body, headers = RATE_LIMITED
    http, calls, waits = scripted([(status, body, {**headers, "retry-after": "3600"})])
    with pytest.raises(MiRotaractRateLimitError) as caught:
        http.request("GET", "https://x.test/a")
    assert caught.value.retry_after == 3600.0
    assert len(calls) == 1 and waits == []


def test_post_is_retried_on_429_only_when_it_opts_in():
    http, calls, _ = scripted([RATE_LIMITED, (200, {})])
    with pytest.raises(MiRotaractRateLimitError):
        http.request("POST", "https://x.test/a")
    assert len(calls) == 1

    http, calls, waits = scripted([RATE_LIMITED, (200, {"ok": True})])
    assert http.request("POST", "https://x.test/token", retry_on_rate_limit=True).data == {"ok": True}
    assert waits == [3.0]

    http, calls, _ = scripted([(503, {"status": 503, "code": "KERNEL_HTTP_503"}), (200, {})])
    with pytest.raises(MiRotaractApiError):
        http.request("POST", "https://x.test/token", retry_on_rate_limit=True)
    assert len(calls) == 1


def test_parse_retry_after_http_date():
    now = datetime(2026, 1, 1, tzinfo=timezone.utc).timestamp()
    assert parse_retry_after("Thu, 01 Jan 2026 00:00:03 GMT", now) == pytest.approx(3.0)
    assert parse_retry_after("nonsense") is None


def test_post_without_idempotency_key_is_not_retried():
    http, calls, _ = scripted([(503, {"status": 503, "code": "KERNEL_HTTP_503"}), (200, {})])
    with pytest.raises(MiRotaractApiError) as info:
        http.request("POST", "https://x.test/a", json={})
    assert info.value.status == 503
    assert len(calls) == 1


def test_post_with_idempotency_key_is_retried_with_same_key():
    http, calls, _ = scripted([(504, None), (200, {"done": 1})])
    http.request("POST", "https://x.test/a", json={}, idempotency_key="k-1")
    assert [c.headers["idempotency-key"] for c in calls] == ["k-1", "k-1"]


def test_network_errors_are_retried_then_wrapped():
    http, calls, _ = scripted([httpx.ConnectError("boom"), (200, {"ok": 1})])
    assert http.request("GET", "https://x.test/a").data == {"ok": 1}
    failing, calls2, _ = scripted([httpx.ConnectError("boom")])
    with pytest.raises(MiRotaractError):
        failing.request("GET", "https://x.test/a")
    assert len(calls2) == 3


def test_problem_details_become_api_error():
    problem = {
        "type": "t",
        "title": "Request failed",
        "status": 403,
        "code": "KERNEL_HTTP_403",
        "detail": "Fuera del alcance de esta app",
        "instance": "/x",
        "traceId": "trc_1",
    }
    http, _, _ = scripted([(403, problem)])
    with pytest.raises(MiRotaractApiError) as info:
        http.request("GET", "https://x.test/a")
    error = info.value
    assert (error.status, error.code, error.detail, error.trace_id) == (
        403,
        "KERNEL_HTTP_403",
        "Fuera del alcance de esta app",
        "trc_1",
    )


def test_oauth_errors_become_oauth_error():
    http, _, _ = scripted([(401, {"error": "invalid_client", "error_description": "nope"})])
    with pytest.raises(MiRotaractOAuthError) as info:
        http.request("POST", "https://x.test/token", form={})
    assert (info.value.error, info.value.error_description, info.value.status) == ("invalid_client", "nope", 401)


def test_304_is_not_modified_with_etag():
    http, _, _ = scripted([(304, None, {"etag": 'W/"abc"'})])
    response = http.request("GET", "https://x.test/a", headers={"if-none-match": 'W/"abc"'})
    assert response.not_modified and response.etag == 'W/"abc"' and response.data is None


def test_query_serialization():
    http, calls, _ = scripted([(200, {})])
    http.request(
        "GET",
        "https://x.test/a",
        params={"a": 1, "b": None, "c": True, "d": datetime(2026, 1, 1, tzinfo=timezone.utc)},
    )
    assert calls[0].url.params == httpx.QueryParams({"a": "1", "c": "true", "d": "2026-01-01T00:00:00Z"})


def test_async_retries():
    calls: list[httpx.Request] = []

    def handler(request):
        calls.append(request)
        return httpx.Response(503) if len(calls) == 1 else httpx.Response(200, json={"ok": True})

    async def no_sleep(_):
        return None

    async def main():
        http = AsyncHttp(HttpConfig(), httpx.AsyncClient(transport=httpx.MockTransport(handler)), no_sleep)
        return await http.request("GET", "https://x.test/a")

    assert asyncio.run(main()).data == {"ok": True}
    assert len(calls) == 2
