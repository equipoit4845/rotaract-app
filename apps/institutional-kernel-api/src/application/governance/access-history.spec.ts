import { describeAccess } from "./access-history";
import { AccessHistoryWriter } from "./access-history.writer";

const options = {
  enabled: true,
  retentionDays: 365,
  coalesceMs: 15 * 60_000,
  flushIntervalMs: 1_000,
  batchSize: 200,
  maxBuffered: 3,
};

function writer(overrides: Partial<typeof options> = {}) {
  const prisma = {
    developerApp: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: "app_1", clientId: "mra_1" }]),
    },
    personAppAccess: { createMany: jest.fn() },
  };
  return {
    prisma,
    writer: new AccessHistoryWriter(prisma as any, {
      ...options,
      ...overrides,
    }),
  };
}

describe("AccessHistoryWriter", () => {
  it("writes in batches and resolves client_id to the app", async () => {
    const { writer: subject, prisma } = writer();
    subject.record({
      personId: "p1",
      clientId: "mra_1",
      kind: "DATA_READ",
      details: ["person", "contact", "person"],
    });
    subject.record({ personId: "p1", appId: "app_9", kind: "SIGN_IN" });
    expect(prisma.personAppAccess.createMany).not.toHaveBeenCalled();
    await subject.flush();
    expect(prisma.personAppAccess.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          personId: "p1",
          appId: "app_1",
          kind: "DATA_READ",
          details: ["contact", "person"],
        }),
        expect.objectContaining({ personId: "p1", appId: "app_9" }),
      ],
    });
  });

  it("coalesces repeated reads and refreshes within the window, never sign-ins", async () => {
    const { writer: subject, prisma } = writer({ maxBuffered: 100 });
    const at = new Date("2026-10-05T12:00:00Z");
    const later = new Date(at.getTime() + 5 * 60_000);
    const muchLater = new Date(at.getTime() + 16 * 60_000);
    for (const when of [at, later, muchLater])
      subject.record({
        personId: "p1",
        appId: "app_1",
        kind: "TOKEN_REFRESH",
        at: when,
      });
    subject.record({ personId: "p1", appId: "app_1", kind: "SIGN_IN", at });
    subject.record({ personId: "p1", appId: "app_1", kind: "SIGN_IN", at });
    // Another person is never coalesced with the first one.
    subject.record({
      personId: "p2",
      appId: "app_1",
      kind: "TOKEN_REFRESH",
      at,
    });
    await subject.flush();
    const rows = prisma.personAppAccess.createMany.mock.calls[0][0].data;
    expect(rows.map((row: any) => `${row.personId}:${row.kind}`)).toEqual([
      "p1:TOKEN_REFRESH",
      "p1:TOKEN_REFRESH",
      "p1:SIGN_IN",
      "p1:SIGN_IN",
      "p2:TOKEN_REFRESH",
    ]);
  });

  it("drops entries past the buffer bound and never throws on a failed batch", async () => {
    const { writer: subject, prisma } = writer();
    for (let i = 0; i < 5; i++)
      subject.record({ personId: `p${i}`, appId: "app_1", kind: "SIGN_IN" });
    expect(subject.pending).toBe(3);
    expect(subject.dropped).toBe(2);
    prisma.personAppAccess.createMany.mockRejectedValueOnce(new Error("down"));
    await expect(subject.flush()).resolves.toBeUndefined();
    expect(subject.pending).toBe(0);
  });

  it("records nothing when disabled or without an app", async () => {
    const { writer: subject } = writer({ enabled: false });
    subject.record({ personId: "p1", appId: "app_1", kind: "SIGN_IN" });
    expect(subject.pending).toBe(0);
    const { writer: other } = writer();
    other.record({ personId: "p1", kind: "SIGN_IN" });
    expect(other.pending).toBe(0);
  });
});

describe("describeAccess", () => {
  it("says what happened and which data, in Spanish", () => {
    expect(describeAccess("DATA_READ", ["contact", "person"])).toBe(
      "Leyó tus datos desde su servidor: tu correo, teléfono y fecha de nacimiento y tus datos de perfil",
    );
    expect(describeAccess("CONSENT_GRANTED", ["openid", "email"])).toBe(
      "Le diste acceso a tu identificador y tu correo",
    );
    expect(describeAccess("CONSENT_REVOKED", [])).toBe("Le quitaste el acceso");
  });
});
