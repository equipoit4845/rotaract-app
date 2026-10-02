import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { SigningKeyStatus } from "@prisma/client";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "crypto";
import {
  createLocalJWKSet,
  exportJWK,
  exportPKCS8,
  generateKeyPair,
  importPKCS8,
  jwtVerify,
  SignJWT,
  type JWK,
  type JWTPayload,
  type KeyLike,
} from "jose";

import { PrismaService } from "../prisma/prisma.service";

const ALG = "ES256";
/** Retired keys stay in the JWKS long enough for any token they signed to expire. */
const RETIRED_KEY_GRACE_MS = 30 * 24 * 60 * 60 * 1_000;
const DEV_ONLY_SECRET = "development-only-signing-key-secret";

export type SignOptions = {
  audience: string | string[];
  subject: string;
  /** Seconds. */
  expiresIn: number;
  /** Extra JOSE header-independent claims are passed in the payload. */
};

/**
 * Asymmetric signing for every token a third party has to verify
 * (developer-app service tokens, OIDC access and ID tokens). Third parties
 * verify with the public keys published at /.well-known/jwks.json and never
 * see a shared secret. The Kernel's own platform session tokens are not
 * affected (they stay internal).
 *
 * Private keys live in the database encrypted with AES-256-GCM under a key
 * derived from KERNEL_SIGNING_KEY_SECRET, so a database dump alone can't
 * forge tokens.
 */
@Injectable()
export class SigningKeyService implements OnModuleInit {
  private readonly logger = new Logger(SigningKeyService.name);
  private cached?: { kid: string; privateKey: KeyLike; loadedAt: number };

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    this.encryptionKey(); // fail fast on a missing production secret
    await this.ensureActiveKey();
  }

  issuer(): string {
    return (
      process.env.KERNEL_ISSUER_URL ?? "http://localhost:3001/api/kernel/v1"
    ).replace(/\/$/, "");
  }

  async sign(payload: JWTPayload, options: SignOptions): Promise<string> {
    const { kid, privateKey } = await this.activeKey();
    const now = Math.floor(Date.now() / 1_000);
    return new SignJWT(payload)
      .setProtectedHeader({ alg: ALG, kid, typ: "JWT" })
      .setIssuer(this.issuer())
      .setAudience(options.audience)
      .setSubject(options.subject)
      .setIssuedAt(now)
      .setExpirationTime(now + options.expiresIn)
      .setJti(randomUUID())
      .sign(privateKey);
  }

  /** Verifies signature, issuer, audience and expiry against the published keys. */
  async verify<T extends JWTPayload = JWTPayload>(
    token: string,
    options: { audience: string | string[] },
  ): Promise<T> {
    const keySet = createLocalJWKSet(await this.jwks());
    const { payload } = await jwtVerify(token, keySet, {
      issuer: this.issuer(),
      audience: options.audience,
      algorithms: [ALG],
    });
    return payload as T;
  }

  async jwks(): Promise<{ keys: JWK[] }> {
    const since = new Date(Date.now() - RETIRED_KEY_GRACE_MS);
    const keys = await this.prisma.signingKey.findMany({
      where: {
        OR: [
          { status: SigningKeyStatus.ACTIVE },
          { status: SigningKeyStatus.RETIRED, retiredAt: { gte: since } },
        ],
      },
      orderBy: { createdAt: "desc" },
    });
    return {
      keys: keys.map((key) => ({
        ...(key.publicJwk as unknown as JWK),
        kid: key.kid,
        alg: key.alg,
        use: "sig",
      })),
    };
  }

  /** Retires every active key and creates a new one. */
  async rotate(): Promise<string> {
    await this.prisma.signingKey.updateMany({
      where: { status: SigningKeyStatus.ACTIVE },
      data: { status: SigningKeyStatus.RETIRED, retiredAt: new Date() },
    });
    this.cached = undefined;
    return this.createKey();
  }

  /**
   * Guarantees a usable ACTIVE key. An active key that can't be decrypted
   * (KERNEL_SIGNING_KEY_SECRET changed or lost) is retired instead of
   * making every token issuance fail: its public part stays in the JWKS for
   * the grace period, so tokens it already signed keep verifying.
   */
  private async ensureActiveKey(): Promise<void> {
    const active = await this.prisma.signingKey.findMany({
      where: { status: SigningKeyStatus.ACTIVE },
    });
    const unusable = active.filter(
      (key) => !this.canDecrypt(key.privateKeyEnc),
    );
    if (unusable.length) {
      this.logger.error(
        `Retiring ${unusable.length} signing key(s) that can't be decrypted with the current KERNEL_SIGNING_KEY_SECRET: ${unusable.map((k) => k.kid).join(", ")}`,
      );
      await this.prisma.signingKey.updateMany({
        where: { kid: { in: unusable.map((key) => key.kid) } },
        data: { status: SigningKeyStatus.RETIRED, retiredAt: new Date() },
      });
    }
    if (active.length === unusable.length) {
      const kid = await this.createKey();
      this.logger.log(`Created signing key ${kid}`);
    }
  }

  private canDecrypt(stored: string): boolean {
    try {
      this.decrypt(stored);
      return true;
    } catch {
      return false;
    }
  }

  private async activeKey(): Promise<{ kid: string; privateKey: KeyLike }> {
    if (this.cached && Date.now() - this.cached.loadedAt < 60_000)
      return this.cached;
    let key = await this.prisma.signingKey.findFirst({
      where: { status: SigningKeyStatus.ACTIVE },
      orderBy: { createdAt: "desc" },
    });
    if (!key) {
      await this.createKey();
      key = await this.prisma.signingKey.findFirstOrThrow({
        where: { status: SigningKeyStatus.ACTIVE },
        orderBy: { createdAt: "desc" },
      });
    }
    const privateKey = await importPKCS8(this.decrypt(key.privateKeyEnc), ALG);
    this.cached = { kid: key.kid, privateKey, loadedAt: Date.now() };
    return this.cached;
  }

  private async createKey(): Promise<string> {
    const { publicKey, privateKey } = await generateKeyPair(ALG, {
      extractable: true,
    });
    const kid = `k_${randomBytes(8).toString("hex")}`;
    const publicJwk = await exportJWK(publicKey);
    await this.prisma.signingKey.create({
      data: {
        kid,
        alg: ALG,
        publicJwk: publicJwk as object,
        privateKeyEnc: this.encrypt(await exportPKCS8(privateKey)),
      },
    });
    return kid;
  }

  private encryptionKey(): Buffer {
    const secret = process.env.KERNEL_SIGNING_KEY_SECRET;
    if (!secret) {
      if (process.env.NODE_ENV === "production")
        throw new Error("KERNEL_SIGNING_KEY_SECRET must be set in production");
      return createHash("sha256").update(DEV_ONLY_SECRET).digest();
    }
    return createHash("sha256").update(secret).digest();
  }

  private encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey(), iv);
    const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    return [iv, cipher.getAuthTag(), data]
      .map((part) => part.toString("base64url"))
      .join(".");
  }

  private decrypt(stored: string): string {
    const [iv, tag, data] = stored
      .split(".")
      .map((part) => Buffer.from(part, "base64url"));
    const decipher = createDecipheriv("aes-256-gcm", this.encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString(
      "utf8",
    );
  }
}
