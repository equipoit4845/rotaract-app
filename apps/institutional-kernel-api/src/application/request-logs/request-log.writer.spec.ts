import type { PrismaService } from "../../infrastructure/prisma/prisma.service";
import type { RequestLogEntry } from "./request-log.context";
import { RequestLogWriter, writerOptionsFromEnv } from "./request-log.writer";

function entry(overrides: Partial<RequestLogEntry> = {}): RequestLogEntry {
  return {
    clientId: "mra_a",
    method: "GET",
    route: "/service/organizations/{organizationId}",
    status: 200,
    problemCode: null,
    problemType: null,
    latencyMs: 5,
    traceId: "t",
    clientIp: "10.0.0.0",
    createdAt: new Date("2026-10-04T00:00:00Z"),
    ...overrides,
  };
}

function fakePrisma() {
  const writes: unknown[][] = [];
  const prisma = {
    developerApp: {
      findMany: jest.fn(async ({ where }: any) =>
        (where.clientId.in as string[])
          .filter((clientId) => clientId !== "mra_unknown")
          .map((clientId) => ({ id: `app_${clientId}`, clientId })),
      ),
    },
    developerAppRequestLog: {
      createMany: jest.fn(async ({ data }: { data: unknown[] }) => {
        writes.push(data);
        return { count: data.length };
      }),
    },
  };
  return { prisma, writes };
}

const options = {
  enabled: true,
  flushIntervalMs: 60_000,
  batchSize: 3,
  maxBuffered: 5,
};

describe("RequestLogWriter (E9.3)", () => {
  it("only queues on record(): no database work on the request path", () => {
    const { prisma } = fakePrisma();
    const writer = new RequestLogWriter(
      prisma as unknown as PrismaService,
      options,
    );
    writer.record(entry());
    writer.record(entry());
    expect(writer.pending).toBe(2);
    expect(prisma.developerAppRequestLog.createMany).not.toHaveBeenCalled();
  });

  it("writes in batches of batchSize with createMany", async () => {
    const { prisma, writes } = fakePrisma();
    const writer = new RequestLogWriter(
      prisma as unknown as PrismaService,
      options,
    );
    for (let i = 0; i < 4; i += 1) writer.record(entry({ traceId: `t${i}` }));
    await writer.flush();
    expect(writes.map((batch) => batch.length)).toEqual([3, 1]);
    expect(writer.pending).toBe(0);
  });

  it("resolves client ids to app ids once and caches them", async () => {
    const { prisma, writes } = fakePrisma();
    const writer = new RequestLogWriter(
      prisma as unknown as PrismaService,
      options,
    );
    writer.record(entry({ clientId: "mra_a" }));
    writer.record(entry({ clientId: "mra_b", appId: "explicit" }));
    await writer.flush();
    writer.record(entry({ clientId: "mra_a" }));
    await writer.flush();
    expect(prisma.developerApp.findMany).toHaveBeenCalledTimes(1);
    const rows = writes.flat() as Array<Record<string, unknown>>;
    expect(rows.map((row) => row.appId)).toEqual([
      "app_mra_a",
      "explicit",
      "app_mra_a",
    ]);
    // clientId is only a lookup key, never stored
    expect(rows.every((row) => !("clientId" in row))).toBe(true);
  });

  it("skips entries whose app no longer exists", async () => {
    const { prisma, writes } = fakePrisma();
    const writer = new RequestLogWriter(
      prisma as unknown as PrismaService,
      options,
    );
    writer.record(entry({ clientId: "mra_unknown" }));
    await writer.flush();
    expect(writes).toEqual([]);
  });

  it("is bounded: drops entries past maxBuffered instead of growing", () => {
    const { prisma } = fakePrisma();
    const writer = new RequestLogWriter(prisma as unknown as PrismaService, {
      ...options,
      batchSize: 100,
    });
    for (let i = 0; i < 8; i += 1) writer.record(entry());
    expect(writer.pending).toBe(5);
    expect(writer.dropped).toBe(3);
  });

  it("a failed batch is dropped, never thrown", async () => {
    const { prisma } = fakePrisma();
    prisma.developerAppRequestLog.createMany.mockRejectedValueOnce(
      new Error("db down"),
    );
    const writer = new RequestLogWriter(
      prisma as unknown as PrismaService,
      options,
    );
    writer.record(entry());
    await expect(writer.flush()).resolves.toBeUndefined();
    expect(writer.pending).toBe(0);
  });

  it("does nothing when disabled", async () => {
    const { prisma } = fakePrisma();
    const writer = new RequestLogWriter(prisma as unknown as PrismaService, {
      ...options,
      enabled: false,
    });
    writer.record(entry());
    expect(writer.pending).toBe(0);
  });

  it("flushes on the interval without anyone awaiting", async () => {
    jest.useFakeTimers();
    try {
      const { prisma } = fakePrisma();
      const writer = new RequestLogWriter(prisma as unknown as PrismaService, {
        ...options,
        flushIntervalMs: 1000,
      });
      writer.onModuleInit();
      writer.record(entry());
      await jest.advanceTimersByTimeAsync(1000);
      expect(prisma.developerAppRequestLog.createMany).toHaveBeenCalledTimes(1);
      await writer.onApplicationShutdown();
    } finally {
      jest.useRealTimers();
    }
  });

  it("reads its options from the environment", () => {
    expect(
      writerOptionsFromEnv({
        KERNEL_REQUEST_LOGS_ENABLED: "false",
        KERNEL_REQUEST_LOGS_FLUSH_MS: "250",
      }),
    ).toMatchObject({ enabled: false, flushIntervalMs: 250, batchSize: 200 });
  });
});
