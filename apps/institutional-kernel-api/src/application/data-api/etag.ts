import { createHash } from "crypto";

/**
 * Weak validator over the exact JSON a client receives (RFC 9110 §8.8.3).
 * Weak because semantic equality of the body is what matters, not bytes on
 * the wire (compression, proxies).
 *
 * The 304 itself is produced by Express: `res.send` compares the request's
 * If-None-Match with the ETag header set by the handler (weak comparison,
 * lists and `*` supported, via the `fresh` module) and strips the body.
 * Doing it there, instead of in the handler, keeps the handler's return value
 * a valid 200 body for the OpenAPI response validator.
 */
export function weakEtag(body: unknown): string {
  const json = JSON.stringify(body) ?? "";
  return `W/"${createHash("sha1").update(json).digest("hex")}"`;
}
