import { readFileSync } from "fs";
import { resolve } from "path";

import { decryptSecret, encryptSecret } from "./secret-box";
import {
  WEBHOOK_USER_AGENT,
  newWebhookSecret,
  signWebhookPayload,
  signatureHeader,
  verifyWebhookSignature,
  webhookHeaders,
} from "./signing";

type Vector = {
  name: string;
  secret: string;
  now: number;
  toleranceSec?: number;
  body: string;
  headers: Record<string, string>;
  expected: { valid: boolean; error?: string };
};

const vectors: Vector[] = JSON.parse(
  readFileSync(
    resolve(__dirname, "../../../../../sdks/conformance/webhook-vectors.json"),
    "utf8",
  ),
).vectors;

describe("webhook signing", () => {
  it("creates whsec_ secrets of 32 random bytes", () => {
    const { secret, hint } = newWebhookSecret();
    expect(secret).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
    expect(hint).toBe(secret.slice(-4));
    expect(newWebhookSecret().secret).not.toBe(secret);
  });

  it("signs <timestamp>.<raw body> with HMAC-SHA256 in hex", () => {
    // Fixed vector, independently computable with:
    //   printf '1700000000.{"a":1}' | openssl dgst -sha256 -hmac whsec_test
    expect(signWebhookPayload("whsec_test", 1700000000, '{"a":1}')).toBe(
      "38877139021993b830af32feea6e18a8da83eb2f6e49ee50bd9e4cf4ca4d3789",
    );
    expect(signWebhookPayload("whsec_test", 1700000000, '{"a":1}')).not.toBe(
      signWebhookPayload("whsec_test", 1700000001, '{"a":1}'),
    );
  });

  it("emits one v1= per secret during a rotation", () => {
    const header = signatureHeader(["whsec_new", "whsec_old"], 1, "{}");
    const parts = header.split(",");
    expect(parts).toHaveLength(2);
    expect(parts[0]).toBe(`v1=${signWebhookPayload("whsec_new", 1, "{}")}`);
    expect(parts[1]).toBe(`v1=${signWebhookPayload("whsec_old", 1, "{}")}`);
  });

  it("builds the contract headers", () => {
    const headers = webhookHeaders({
      eventId: "evt_1",
      timestamp: 1790985600,
      body: "{}",
      secrets: ["whsec_x"],
    });
    expect(headers).toEqual({
      "Content-Type": "application/json",
      "MiRotaract-Webhook-Id": "evt_1",
      "MiRotaract-Webhook-Timestamp": "1790985600",
      "MiRotaract-Signature": `v1=${signWebhookPayload("whsec_x", 1790985600, "{}")}`,
      "User-Agent": WEBHOOK_USER_AGENT,
    });
    expect(WEBHOOK_USER_AGENT).toBe("MiRotaract-Webhooks/1");
  });

  it("verifies its own signatures and rejects stale or tampered ones", () => {
    const now = 1790985600;
    const body = '{"id":"evt_1"}';
    const signature = signatureHeader(["whsec_a"], now, body);
    const base = { secret: "whsec_a", timestamp: now, body, signature, now };
    expect(verifyWebhookSignature(base)).toBe(true);
    expect(verifyWebhookSignature({ ...base, now: now + 301 })).toBe(false);
    expect(verifyWebhookSignature({ ...base, body: body + " " })).toBe(false);
    expect(verifyWebhookSignature({ ...base, secret: "whsec_b" })).toBe(false);
  });

  describe("shared conformance vectors (sdks/conformance/webhook-vectors.json)", () => {
    it.each(vectors.map((vector) => [vector.name, vector]))(
      "%s",
      (_name, vector) => {
        const header = (name: string) =>
          Object.entries(vector.headers).find(
            ([key]) => key.toLowerCase() === name.toLowerCase(),
          )?.[1];
        const signature = header("MiRotaract-Signature");
        const timestamp = header("MiRotaract-Webhook-Timestamp");
        let parsed = true;
        try {
          JSON.parse(vector.body);
        } catch {
          parsed = false;
        }
        const valid =
          !!signature &&
          !!timestamp &&
          /^\d+$/.test(timestamp) &&
          verifyWebhookSignature({
            secret: vector.secret,
            timestamp,
            body: vector.body,
            signature,
            toleranceSec: vector.toleranceSec,
            now: vector.now,
          }) &&
          parsed;
        expect(valid).toBe(vector.expected.valid);
      },
    );
  });
});

describe("secret box", () => {
  it("round-trips and never stores the plaintext", () => {
    const { secret } = newWebhookSecret();
    const stored = encryptSecret(secret);
    expect(stored).not.toContain(secret.slice(6, 20));
    expect(decryptSecret(stored)).toBe(secret);
    expect(encryptSecret(secret)).not.toBe(stored); // random IV
  });

  it("fails on tampered ciphertext", () => {
    const stored = encryptSecret("whsec_x");
    const [iv, tag, data] = stored.split(".");
    const flipped = Buffer.from(data, "base64url");
    flipped[0] ^= 1;
    expect(() =>
      decryptSecret([iv, tag, flipped.toString("base64url")].join(".")),
    ).toThrow();
  });
});
