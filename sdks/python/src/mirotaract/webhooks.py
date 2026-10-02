"""Webhooks de Mi Rotaract (docs/developers/webhooks.md).

Every POST carries:

- ``MiRotaract-Webhook-Id: evt_...``: the same on every retry; deduplicate on it.
- ``MiRotaract-Webhook-Timestamp: <unix seconds>``
- ``MiRotaract-Signature: v1=<hex HMAC-SHA256(secret, "<timestamp>.<raw body>")>``
  (several comma-separated ``v1=`` values during a secret rotation).

``verify_webhook`` checks all of that in one line. It needs the RAW body
(``await request.body()`` in FastAPI/Starlette, ``request.get_data()`` in
Flask): a body that was parsed and re-serialized no longer matches.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import re
import time
from typing import Any, Iterable, Mapping, Sequence

from .errors import MiRotaractError

WEBHOOK_ID_HEADER = "MiRotaract-Webhook-Id"
WEBHOOK_TIMESTAMP_HEADER = "MiRotaract-Webhook-Timestamp"
WEBHOOK_SIGNATURE_HEADER = "MiRotaract-Signature"
DEFAULT_TOLERANCE = 300
_HEX64 = re.compile(r"^[0-9a-fA-F]{64}$")


class MiRotaractWebhookError(MiRotaractError):
    """A webhook failed verification.

    ``code`` is one of ``missing_header``, ``invalid_timestamp``,
    ``timestamp_out_of_tolerance``, ``invalid_signature``, ``invalid_payload``.
    """

    def __init__(self, code: str, message: str):
        self.code: str = code
        super().__init__(message)


def _header(headers: Any, name: str) -> str | None:
    if headers is None:
        return None
    lower = name.lower()
    items: Iterable[tuple[Any, Any]]
    if hasattr(headers, "items"):
        items = headers.items()
    else:
        items = headers  # list of pairs (ASGI scope style)
    for key, value in items:
        if isinstance(key, bytes):
            key = key.decode("latin-1")
        if str(key).lower() == lower:
            if isinstance(value, bytes):
                value = value.decode("latin-1")
            if isinstance(value, (list, tuple)):
                return ",".join(str(v) for v in value)
            return str(value)
    return None


def verify_webhook(
    payload: bytes | bytearray | memoryview | str,
    headers: Mapping[str, Any] | Sequence[tuple[Any, Any]],
    secret: str | Sequence[str],
    tolerance: int = DEFAULT_TOLERANCE,
    *,
    now: int | None = None,
) -> dict[str, Any]:
    """Verifies a webhook and returns the event (``dict``).

    Raises ``MiRotaractWebhookError``. ``secret`` may be a list (during a
    rotation of your own configuration). ``now`` (Unix seconds) is for tests.

    >>> event = verify_webhook(await request.body(), request.headers, os.environ["MIROTARACT_WEBHOOK_SECRET"])
    """
    signature = _header(headers, WEBHOOK_SIGNATURE_HEADER)
    timestamp_text = _header(headers, WEBHOOK_TIMESTAMP_HEADER)
    if not signature or not timestamp_text:
        raise MiRotaractWebhookError(
            "missing_header",
            f"Faltan las cabeceras {WEBHOOK_SIGNATURE_HEADER} / {WEBHOOK_TIMESTAMP_HEADER}",
        )
    timestamp_text = timestamp_text.strip()
    if not timestamp_text.isdigit() or not timestamp_text.isascii():
        raise MiRotaractWebhookError(
            "invalid_timestamp", f"{WEBHOOK_TIMESTAMP_HEADER} no es un número de segundos"
        )
    timestamp = int(timestamp_text)
    current = int(time.time()) if now is None else int(now)
    if abs(current - timestamp) > tolerance:
        raise MiRotaractWebhookError(
            "timestamp_out_of_tolerance",
            f"La marca de tiempo está a más de {tolerance} s del reloj local",
        )

    if isinstance(payload, str):
        body = payload.encode("utf-8")
    elif isinstance(payload, (bytes, bytearray, memoryview)):
        body = bytes(payload)
    else:
        raise MiRotaractWebhookError(
            "invalid_payload",
            "payload tiene que ser el cuerpo crudo (bytes), no un objeto ya parseado",
        )

    secrets = [secret] if isinstance(secret, str) else list(secret)
    if not secrets or any(not s for s in secrets):
        raise MiRotaractWebhookError("invalid_signature", "Falta el secreto del webhook")
    candidates = [
        part.strip()[3:].lower()
        for part in signature.split(",")
        if part.strip().startswith("v1=") and _HEX64.match(part.strip()[3:])
    ]
    signed = f"{timestamp}.".encode("ascii") + body
    valid = False
    for key in secrets:
        expected = hmac.new(key.encode("utf-8"), signed, hashlib.sha256).hexdigest()
        for candidate in candidates:
            if hmac.compare_digest(expected, candidate):
                valid = True
    if not valid:
        raise MiRotaractWebhookError(
            "invalid_signature",
            "La firma no coincide: revisá el secreto y que estés usando el cuerpo crudo",
        )

    try:
        event = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        raise MiRotaractWebhookError("invalid_payload", "El cuerpo no es JSON") from None
    if not isinstance(event, dict) or not isinstance(event.get("id"), str) or not isinstance(
        event.get("type"), str
    ):
        raise MiRotaractWebhookError("invalid_payload", "El cuerpo no es un evento de Mi Rotaract")
    return event


__all__ = [
    "MiRotaractWebhookError",
    "verify_webhook",
    "WEBHOOK_ID_HEADER",
    "WEBHOOK_TIMESTAMP_HEADER",
    "WEBHOOK_SIGNATURE_HEADER",
    "DEFAULT_TOLERANCE",
]
