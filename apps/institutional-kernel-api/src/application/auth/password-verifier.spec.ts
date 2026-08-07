import * as argon2 from "argon2";
import * as bcrypt from "bcryptjs";

import { verifyPasswordHash } from "./password-verifier";

describe("verifyPasswordHash", () => {
  it("accepts a legacy bcrypt hash and marks it for replacement", async () => {
    const hash = await bcrypt.hash("legacy-password-123", 4);

    await expect(
      verifyPasswordHash(hash, "legacy-password-123"),
    ).resolves.toEqual({
      matches: true,
      needsRehash: true,
    });
  });

  it("keeps Argon2id hashes on the modern path", async () => {
    const hash = await argon2.hash("modern-password-123");

    await expect(
      verifyPasswordHash(hash, "modern-password-123"),
    ).resolves.toEqual({
      matches: true,
      needsRehash: false,
    });
  });
});
