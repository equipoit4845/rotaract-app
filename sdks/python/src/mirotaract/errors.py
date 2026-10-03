"""Typed errors of the SDK.

- ``MiRotaractApiError``: the Kernel answered with Problem Details (RFC 9457),
  e.g. 403 "Fuera del alcance de esta app".
- ``MiRotaractOAuthError``: an ``/oauth/*`` endpoint answered with an RFC 6749
  error (``invalid_client``, ``invalid_grant``...), a token failed local
  verification (``invalid_token``) or the callback carried ``error=...``.
- ``MiRotaractRateLimitError``: 429, the app used up its quota
  (``KERNEL_RATE_LIMITED``) after the SDK retried what it safely could.
- ``MiRotaractConfigError``: invalid configuration.
"""

from __future__ import annotations

from typing import Any, Mapping


class MiRotaractError(Exception):
    """Base class of every SDK error."""


class MiRotaractApiError(MiRotaractError):
    def __init__(self, status: int, problem: Mapping[str, Any] | None = None, body: Any = None):
        problem = dict(problem or {})
        self.status: int = status
        self.code: str = str(problem.get("code") or f"HTTP_{status}")
        self.title: str = str(problem.get("title") or f"HTTP {status}")
        self.detail: str | None = problem.get("detail")
        self.trace_id: str | None = problem.get("traceId")
        self.type: str | None = problem.get("type")
        self.instance: str | None = problem.get("instance")
        self.body: Any = body if body is not None else problem
        suffix = f": {self.detail}" if self.detail else f" {self.title}"
        super().__init__(f"{status} {self.code}{suffix}")


class MiRotaractRateLimitError(MiRotaractApiError):
    """429: ``retry_after`` (seconds, from ``Retry-After``) and the raw
    ``RateLimit-Policy`` / ``RateLimit`` headers."""

    def __init__(
        self,
        problem: Mapping[str, Any] | None = None,
        body: Any = None,
        *,
        retry_after: float | None = None,
        rate_limit_policy: str | None = None,
        rate_limit: str | None = None,
    ):
        merged = {"code": "KERNEL_RATE_LIMITED", **dict(problem or {})}
        super().__init__(429, merged, body if body is not None else problem)
        self.retry_after: float | None = retry_after
        self.rate_limit_policy: str | None = rate_limit_policy
        self.rate_limit: str | None = rate_limit


class MiRotaractOAuthError(MiRotaractError):
    def __init__(self, error: str, error_description: str | None = None, status: int | None = None):
        self.error: str = error
        self.error_description: str | None = error_description
        self.status: int | None = status
        super().__init__(f"{error}: {error_description}" if error_description else error)


class MiRotaractConfigError(MiRotaractError):
    pass


def error_from_response(
    status: int, body: Any, headers: Mapping[str, str] | None = None
) -> MiRotaractError:
    if status == 429:
        from ._http import parse_retry_after

        headers = headers or {}
        problem = body if isinstance(body, Mapping) else {
            "status": 429,
            "detail": body[:500] if isinstance(body, str) and body else None,
        }
        retry_after = parse_retry_after(headers.get("retry-after"))
        return MiRotaractRateLimitError(
            problem,
            body,
            retry_after=None if retry_after is None else float(int(retry_after + 0.999)),
            rate_limit_policy=headers.get("ratelimit-policy"),
            rate_limit=headers.get("ratelimit"),
        )
    if isinstance(body, Mapping):
        if isinstance(body.get("error"), str) and not isinstance(body.get("code"), str):
            description = body.get("error_description")
            return MiRotaractOAuthError(
                body["error"], description if isinstance(description, str) else None, status
            )
        return MiRotaractApiError(status, body, body)
    detail = body[:500] if isinstance(body, str) and body else None
    return MiRotaractApiError(status, {"status": status, "detail": detail}, body)
