import hashlib
import hmac
import json
import time

import pytest

from app.webhooks import WebhookVerificationError, verify_webhook

SECRET = "whsec_test"


def sign(body: bytes, timestamp: int, secret: str = SECRET) -> dict[str, str]:
    signature = hmac.new(secret.encode(), f"{timestamp}.".encode() + body, hashlib.sha256).hexdigest()
    return {"MiRotaract-Webhook-Timestamp": str(timestamp), "MiRotaract-Signature": f"v1={signature}"}


def test_valid_signature():
    body = json.dumps({"id": "evt_1", "type": "ping.v1"}).encode()
    assert verify_webhook(body, sign(body, int(time.time())), SECRET)["id"] == "evt_1"


def test_rotation_accepts_any_v1():
    body = b'{"id":"evt_2","type":"ping.v1"}'
    headers = sign(body, int(time.time()))
    headers["MiRotaract-Signature"] = "v1=deadbeef," + headers["MiRotaract-Signature"]
    assert verify_webhook(body, headers, SECRET)["id"] == "evt_2"


@pytest.mark.parametrize(
    "mutate",
    [
        lambda b, h: (b + b" ", h),  # cuerpo alterado
        lambda b, h: (b, {**h, "MiRotaract-Webhook-Timestamp": str(int(time.time()) - 3600)}),  # viejo
        lambda b, h: (b, {k: v for k, v in h.items() if k != "MiRotaract-Signature"}),  # sin firma
    ],
)
def test_rejects(mutate):
    body = b'{"id":"evt_3","type":"ping.v1"}'
    body, headers = mutate(body, sign(body, int(time.time())))
    with pytest.raises(WebhookVerificationError):
        verify_webhook(body, headers, SECRET)
