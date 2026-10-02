"""Typed errors of the SDK.

- ``MiRotaractApiError``: the Kernel answered with Problem Details (RFC 9457),
  e.g. 403 "Fuera del alcance de esta app".
- ``MiRotaractOAuthError``: an ``/oauth/*`` endpoint answered with an RFC 6749
  error (``invalid_client``, ``invalid_grant``...), a token failed local
  verification (``invalid_token``) or the callback carried ``error=...``.
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


class MiRotaractOAuthError(MiRotaractError):
    def __init__(self, error: str, error_description: str | None = None, status: int | None = None):
        self.error: str = error
        self.error_description: str | None = error_description
        self.status: int | None = status
        super().__init__(f"{error}: {error_description}" if error_description else error)


class MiRotaractConfigError(MiRotaractError):
    pass


def error_from_response(status: int, body: Any) -> MiRotaractError:
    if isinstance(body, Mapping):
        if isinstance(body.get("error"), str) and not isinstance(body.get("code"), str):
            description = body.get("error_description")
            return MiRotaractOAuthError(
                body["error"], description if isinstance(description, str) else None, status
            )
        return MiRotaractApiError(status, body, body)
    detail = body[:500] if isinstance(body, str) and body else None
    return MiRotaractApiError(status, {"status": status, "detail": detail}, body)
