import * as argon2 from "argon2";
import * as bcrypt from "bcryptjs";

export type PasswordVerification = {
  matches: boolean;
  /** A successful legacy verification must be upgraded immediately. */
  needsRehash: boolean;
};

const BCRYPT_PREFIX = /^\$2[aby]\$\d{2}\$/;

/**
 * Supports the one-time bcrypt -> Argon2id migration of the former
 * Mi Rotaract application. New passwords are always written with Argon2id.
 */
export async function verifyPasswordHash(
  passwordHash: string,
  password: string,
): Promise<PasswordVerification> {
  if (BCRYPT_PREFIX.test(passwordHash)) {
    return {
      matches: await bcrypt.compare(password, passwordHash),
      needsRehash: true,
    };
  }

  return {
    matches: await argon2.verify(passwordHash, password),
    needsRehash: false,
  };
}
