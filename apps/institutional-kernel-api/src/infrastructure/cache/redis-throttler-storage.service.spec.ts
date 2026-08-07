import { OptionalRedisCacheService } from "./optional-redis-cache.service";
import { RedisThrottlerStorageService } from "./redis-throttler-storage.service";

function buildStorage(overrides: Partial<OptionalRedisCacheService> = {}) {
  const cache = {
    incr: jest.fn().mockResolvedValue(1),
    pexpire: jest.fn(),
    pttl: jest.fn().mockResolvedValue(undefined),
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
    ...overrides,
  } as unknown as OptionalRedisCacheService;
  return { storage: new RedisThrottlerStorageService(cache), cache };
}

describe("RedisThrottlerStorageService", () => {
  it("counts hits through Redis and is not blocked under the limit", async () => {
    const { storage, cache } = buildStorage({
      incr: jest.fn().mockResolvedValue(3),
      pttl: jest
        .fn()
        .mockResolvedValueOnce(undefined) // block key lookup: not blocked
        .mockResolvedValueOnce(45_000), // hits key ttl
    });

    const record = await storage.increment(
      "1.2.3.4",
      60_000,
      5,
      120_000,
      "default",
    );

    expect(record.totalHits).toBe(3);
    expect(record.isBlocked).toBe(false);
    expect(cache.set).not.toHaveBeenCalled();
  });

  it("sets a block key once the limit is exceeded", async () => {
    const { storage, cache } = buildStorage({
      incr: jest.fn().mockResolvedValue(6),
      pttl: jest
        .fn()
        .mockResolvedValueOnce(undefined) // block key lookup: not blocked yet
        .mockResolvedValueOnce(30_000), // hits key ttl
    });

    const record = await storage.increment(
      "1.2.3.4",
      60_000,
      5,
      120_000,
      "default",
    );

    expect(record.isBlocked).toBe(true);
    expect(record.timeToBlockExpire).toBe(120);
    expect(cache.set).toHaveBeenCalledWith(
      expect.stringContaining("kernel:throttle-block:"),
      1,
      120,
    );
  });

  it("reports blocked immediately when a block key is already active, without re-incrementing", async () => {
    const { storage, cache } = buildStorage({
      pttl: jest.fn().mockResolvedValue(15_000),
    });

    const record = await storage.increment(
      "1.2.3.4",
      60_000,
      5,
      120_000,
      "default",
    );

    expect(record.isBlocked).toBe(true);
    expect(record.timeToBlockExpire).toBe(15);
    expect(cache.incr).not.toHaveBeenCalled();
  });

  it("falls back to in-memory storage when Redis is unavailable", async () => {
    jest.useFakeTimers();
    try {
      const { storage } = buildStorage({
        incr: jest.fn().mockResolvedValue(undefined),
      });

      const first = await storage.increment(
        "1.2.3.4",
        60_000,
        5,
        120_000,
        "default",
      );
      const second = await storage.increment(
        "1.2.3.4",
        60_000,
        5,
        120_000,
        "default",
      );

      expect(first.totalHits).toBe(1);
      expect(second.totalHits).toBe(2);
    } finally {
      jest.useRealTimers();
    }
  });
});
