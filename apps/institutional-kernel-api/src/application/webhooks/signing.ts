import { createHmac, randomBytes, timingSafeEqual } from "crypto";

/**
 * Webhook signature (docs/13-events-and-webhooks.md §Firma):
 *
 *   MiRotaract-Signature: v1=<hex HMAC-SHA256(secret, "<timestamp>.<raw body>")>
 *
 * The HMAC key is the whole secret string ("whsec_..."), UTF-8 encoded.
 * During a rotation the header carries one `v1=` per valid secret,
 * comma-separated; a receiver accepts the request when any of them matches.
 * Shared test vectors: sdks/conformance/webhook-vectors.json.
 */

export const WEBHOOK_HEADERS = {
  id: "MiRotaract-Webhook-Id",
  timestamp: "MiRotaract-Webhook-Timestamp",
  signature: "MiRotaract-Signature",
  userAgent: "User-Agent",
} as const;

export const WEBHOOK_USER_AGENT = "MiRotaract-Webhooks/1";

/** whsec_ + base64url(32 random bytes). */
export function newWebhookSecret(): { secret: string; hint: string } {
  const secret = `whsec_${randomBytes(32).toString("base64url")}`;
  return { secret, hint: secret.slice(-4) };
}

export function signWebhookPayload(
  secret: string,
  timestamp: number,
  body: string,
): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
}

export function signatureHeader(
  secrets: readonly string[],
  timestamp: number,
  body: string,
): string {
  return secrets
    .map((secret) => `v1=${signWebhookPayload(secret, timestamp, body)}`)
    .join(",");
}

export function webhookHeaders(input: {
  eventId: string;
  timestamp: number;
  body: string;
  secrets: readonly string[];
}): Record<string, string> {
  return {
    "Content-Type": "application/json",
    [WEBHOOK_HEADERS.id]: input.eventId,
    [WEBHOOK_HEADERS.timestamp]: String(input.timestamp),
    [WEBHOOK_HEADERS.signature]: signatureHeader(
      input.secrets,
      input.timestamp,
      input.body,
    ),
    [WEBHOOK_HEADERS.userAgent]: WEBHOOK_USER_AGENT,
  };
}

/**
 * Reference verifier (the SDKs implement the same algorithm). Used by the
 * Kernel's own tests; returns false instead of throwing.
 */
export function verifyWebhookSignature(input: {
  secret: string;
  timestamp: string | number;
  body: string;
  signature: string;
  toleranceSec?: number;
  now?: number;
}): boolean {
  const timestamp = Number(input.timestamp);
  if (!Number.isInteger(timestamp)) return false;
  const now = input.now ?? Math.floor(Date.now() / 1_000);
  if (Math.abs(now - timestamp) > (input.toleranceSec ?? 300)) return false;
  const expected = Buffer.from(
    signWebhookPayload(input.secret, timestamp, input.body),
    "hex",
  );
  return input.signature
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("v1="))
    .some((part) => {
      const given = Buffer.from(part.slice(3), "hex");
      return (
        given.length === expected.length && timingSafeEqual(given, expected)
      );
    });
}
