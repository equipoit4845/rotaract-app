"""Verificación de webhooks de Mi Rotaract (HMAC-SHA256 con marca de tiempo).

    MiRotaract-Signature: v1=<hex(HMAC(secret, "<timestamp>.<cuerpo crudo>"))>[,v1=...]

Si tu versión del SDK ya trae ``mirotaract.verify_webhook``, usala en su lugar.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from typing import Any, Mapping


class WebhookVerificationError(Exception):
    pass


def verify_webhook(payload: bytes, headers: Mapping[str, str], secret: str, tolerance: int = 300) -> dict[str, Any]:
    lower = {k.lower(): v for k, v in headers.items()}
    timestamp = lower.get("mirotaract-webhook-timestamp")
    signature = lower.get("mirotaract-signature")
    if not timestamp or not signature:
        raise WebhookVerificationError("Faltan los encabezados de firma")
    try:
        seconds = int(timestamp)
    except ValueError as error:
        raise WebhookVerificationError("Marca de tiempo inválida") from error
    if abs(time.time() - seconds) > tolerance:
        raise WebhookVerificationError("Marca de tiempo fuera de tolerancia")
    expected = hmac.new(secret.encode(), f"{timestamp}.".encode() + payload, hashlib.sha256).hexdigest()
    candidates = [part.strip()[3:] for part in signature.split(",") if part.strip().startswith("v1=")]
    if not any(hmac.compare_digest(candidate, expected) for candidate in candidates):
        raise WebhookVerificationError("Firma inválida")
    return json.loads(payload)
