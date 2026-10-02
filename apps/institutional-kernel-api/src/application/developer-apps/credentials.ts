import * as argon2 from "argon2";
import { createHash, randomBytes } from "crypto";

/**
 * Credential formats of the developer platform
 * (docs/11-developer-platform-auth.md). Prefixes make leaked values easy to
 * recognize and grep for (mra_ client id, mrs_ secret, mrc_ code,
 * mrr_ refresh token).
 */
export function newClientId(): string {
  return `mra_${randomBytes(10).toString("hex")}`;
}

export function newClientSecret(): { secret: string; hint: string } {
  const secret = `mrs_${randomBytes(32).toString("base64url")}`;
  return { secret, hint: secret.slice(-4) };
}

export function hashClientSecret(secret: string): Promise<string> {
  return argon2.hash(secret, { type: argon2.argon2id });
}

export async function verifyClientSecret(
  hash: string,
  secret: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, secret);
  } catch {
    return false;
  }
}

/** High-entropy opaque token + the SHA-256 we store (lookup by hash). */
export function newOpaqueToken(prefix: "mrc_" | "mrr_", bytes: number) {
  const token = `${prefix}${randomBytes(bytes).toString("base64url")}`;
  return { token, hash: sha256(token) };
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** PKCE S256 (RFC 7636 §4.6). */
export function pkceS256(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}
