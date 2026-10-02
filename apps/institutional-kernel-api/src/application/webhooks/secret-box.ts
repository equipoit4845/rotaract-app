import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";

/**
 * Webhook signing secrets are symmetric: the Kernel needs the plaintext to
 * compute every HMAC, so they can't be hashed like client secrets. They are
 * stored encrypted with AES-256-GCM, exactly like the ES256 private keys
 * (SigningKeyService), under a key derived from KERNEL_SIGNING_KEY_SECRET
 * with its own label, so a database dump alone can't sign webhooks.
 */

const LABEL = "mirotaract-webhook-secrets:v1:";
const DEV_ONLY_SECRET = "development-only-signing-key-secret";

function key(): Buffer {
  const secret = process.env.KERNEL_SIGNING_KEY_SECRET;
  if (!secret && process.env.NODE_ENV === "production")
    throw new Error("KERNEL_SIGNING_KEY_SECRET must be set in production");
  return createHash("sha256")
    .update(LABEL + (secret || DEV_ONLY_SECRET))
    .digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data]
    .map((part) => part.toString("base64url"))
    .join(".");
}

export function decryptSecret(stored: string): string {
  const [iv, tag, data] = stored
    .split(".")
    .map((part) => Buffer.from(part, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8",
  );
}
