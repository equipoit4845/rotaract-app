import { decodeProtectedHeader } from "jose";

import { PrismaService } from "../prisma/prisma.service";
import { SigningKeyService } from "./signing-key.service";

/** Minimal in-memory stand-in for prisma.signingKey. */
function memoryPrisma() {
  const rows: any[] = [];
  const matches = (row: any, where: any = {}): boolean => {
    if (where.OR) return where.OR.some((w: any) => matches(row, w));
    if (where.status && row.status !== where.status) return false;
    if (where.retiredAt?.gte && !(row.retiredAt >= where.retiredAt.gte))
      return false;
    return true;
  };
  const sorted = () =>
    [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return {
    rows,
    signingKey: {
      create: jest.fn(async ({ data }: any) => {
        const row = {
          status: "ACTIVE",
          createdAt: new Date(Date.now() + rows.length),
          retiredAt: null,
          ...data,
        };
        rows.push(row);
        return row;
      }),
      count: jest.fn(
        async ({ where }: any) => rows.filter((r) => matches(r, where)).length,
      ),
      findMany: jest.fn(async ({ where }: any) =>
        sorted().filter((r) => matches(r, where)),
      ),
      findFirst: jest.fn(
        async ({ where }: any) =>
          sorted().find((r) => matches(r, where)) ?? null,
      ),
      findFirstOrThrow: jest.fn(async ({ where }: any) => {
        const row = sorted().find((r) => matches(r, where));
        if (!row) throw new Error("not found");
        return row;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        rows
          .filter((r) => matches(r, where))
          .forEach((r) => Object.assign(r, data));
        return { count: rows.length };
      }),
    },
  };
}

describe("SigningKeyService", () => {
  const OLD_ENV = { ...process.env };
  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  it("signs ES256 tokens with a kid that verify against the published JWKS", async () => {
    const prisma = memoryPrisma();
    const keys = new SigningKeyService(prisma as unknown as PrismaService);
    await keys.onModuleInit();

    const token = await keys.sign(
      { scope: "kernel.service.organizations.read" },
      { audience: "institutional-kernel", subject: "app:mra_1", expiresIn: 60 },
    );
    const header = decodeProtectedHeader(token);
    expect(header.alg).toBe("ES256");
    expect((await keys.jwks()).keys.map((k) => k.kid)).toContain(header.kid);

    const payload = await keys.verify(token, {
      audience: "institutional-kernel",
    });
    expect(payload.sub).toBe("app:mra_1");
    expect(payload.iss).toBe(keys.issuer());
    // The private key never reaches the JWKS.
    expect(JSON.stringify(await keys.jwks())).not.toContain('"d"');
  });

  it("rejects a token for another audience", async () => {
    const keys = new SigningKeyService(
      memoryPrisma() as unknown as PrismaService,
    );
    const token = await keys.sign(
      {},
      { audience: "some-app", subject: "per_1", expiresIn: 60 },
    );
    await expect(
      keys.verify(token, { audience: "institutional-kernel" }),
    ).rejects.toThrow();
  });

  it("keeps verifying tokens signed before a rotation", async () => {
    const prisma = memoryPrisma();
    const keys = new SigningKeyService(prisma as unknown as PrismaService);
    const before = await keys.sign(
      {},
      { audience: "institutional-kernel", subject: "app:x", expiresIn: 60 },
    );
    await keys.rotate();
    const after = await keys.sign(
      {},
      { audience: "institutional-kernel", subject: "app:x", expiresIn: 60 },
    );
    expect(decodeProtectedHeader(after).kid).not.toBe(
      decodeProtectedHeader(before).kid,
    );
    await expect(
      keys.verify(before, { audience: "institutional-kernel" }),
    ).resolves.toBeTruthy();
  });

  it("stores the private key encrypted, never as PEM", async () => {
    const prisma = memoryPrisma();
    await new SigningKeyService(
      prisma as unknown as PrismaService,
    ).onModuleInit();
    expect(prisma.rows[0].privateKeyEnc).not.toContain("PRIVATE KEY");
  });

  it("refuses to start in production without KERNEL_SIGNING_KEY_SECRET", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.KERNEL_SIGNING_KEY_SECRET;
    const keys = new SigningKeyService(
      memoryPrisma() as unknown as PrismaService,
    );
    await expect(keys.onModuleInit()).rejects.toThrow(
      /KERNEL_SIGNING_KEY_SECRET/,
    );
  });
});
