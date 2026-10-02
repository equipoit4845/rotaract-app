from __future__ import annotations

import hashlib
import hmac
import json
import time
from pathlib import Path

import pytest

import mirotaract
from mirotaract import MiRotaractWebhookError, verify_webhook

VECTORS = json.loads(
    (Path(__file__).resolve().parents[2] / "conformance" / "webhook-vectors.json").read_text(
        encoding="utf-8"
    )
)["vectors"]


@pytest.mark.parametrize("vector", VECTORS, ids=[v["name"] for v in VECTORS])
def test_shared_vectors(vector):
    def run():
        return verify_webhook(
            vector["body"].encode("utf-8"),
            vector["headers"],
            vector["secret"],
            vector.get("toleranceSec", 300),
            now=vector["now"],
        )

    if vector["expected"]["valid"]:
        event = run()
        assert event["id"] == vector["expected"]["eventId"]
        assert event["type"] == vector["expected"]["type"]
    else:
        with pytest.raises(MiRotaractWebhookError) as raised:
            run()
        assert raised.value.code == vector["expected"]["error"]


SECRET = "whsec_python-unit-test"
BODY = json.dumps({"id": "evt_1", "type": "ping.v1", "createdAt": "x", "organizationId": "o", "data": {}})


def signed(body: str, at: int | None = None) -> dict[str, str]:
    at = int(time.time()) if at is None else at
    sig = hmac.new(SECRET.encode(), f"{at}.{body}".encode(), hashlib.sha256).hexdigest()
    return {
        "MiRotaract-Webhook-Id": "evt_1",
        "MiRotaract-Webhook-Timestamp": str(at),
        "MiRotaract-Signature": f"v1={sig}",
    }


def test_exported_from_package_root():
    assert mirotaract.verify_webhook is verify_webhook


def test_accepts_asgi_header_pairs_and_secret_lists():
    pairs = [(k.lower().encode(), v.encode()) for k, v in signed(BODY).items()]
    event = verify_webhook(BODY.encode(), pairs, ["whsec_other", SECRET])
    assert event["type"] == "ping.v1"


def test_rejects_parsed_body():
    with pytest.raises(MiRotaractWebhookError) as raised:
        verify_webhook(json.loads(BODY), signed(BODY), SECRET)  # type: ignore[arg-type]
    assert raised.value.code == "invalid_payload"


def test_non_ascii_signature_is_just_invalid():
    headers = {**signed(BODY), "MiRotaract-Signature": "v1=ñ" * 3}
    with pytest.raises(MiRotaractWebhookError) as raised:
        verify_webhook(BODY.encode(), headers, SECRET)
    assert raised.value.code == "invalid_signature"
