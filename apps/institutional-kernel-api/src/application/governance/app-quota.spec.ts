import {
  decide,
  quotaDefaultsFromEnv,
  quotaLimitsFor,
  quotaWindows,
  rateLimitHeaders,
  validateQuotaOverride,
} from "./app-quota";
import { AppQuotaService, AppRateLimitedException } from "./app-quota.service";

const defaults = {
  enabled: true,
  perMinute: 100,
  perDay: 20_000,
  reviewPerMinute: 20,
  reviewPerDay: 1_000,
};

describe("quota limits", () => {
  it("uses the in-review defaults for an app that was never approved", () => {
    expect(quotaLimitsFor({ approvedAt: null }, defaults)).toEqual({
      perMinute: 20,
      perDay: 1_000,
      source: "review",
    });
  });

  it("uses the district defaults once approved", () => {
    expect(quotaLimitsFor({ approvedAt: new Date() }, defaults)).toEqual({
      perMinute: 100,
      perDay: 20_000,
      source: "default",
    });
  });

  it("lets the RDR's override win", () => {
    expect(
      quotaLimitsFor({ approvedAt: new Date(), quotaPerMinute: 5 }, defaults),
    ).toEqual({ perMinute: 5, perDay: 20_000, source: "custom" });
  });

  it("reads defaults from the environment", () => {
    expect(
      quotaDefaultsFromEnv({
        KERNEL_APP_QUOTA_PER_MINUTE: "300",
        KERNEL_APP_REVIEW_QUOTA_PER_DAY: "nope",
        KERNEL_APP_QUOTAS_ENABLED: "false",
      }),
    ).toEqual({
      enabled: false,
      perMinute: 300,
      perDay: 20_000,
      reviewPerMinute: 20,
      reviewPerDay: 1_000,
    });
  });
});

describe("quota windows and headers", () => {
  const now = new Date("2026-10-05T12:34:50.500Z");

  it("uses the UTC minute and day, keyed by client_id", () => {
    const windows = quotaWindows("mra_1", now);
    expect(windows.minuteKey).toBe(
      `kernel:app-quota:mra_1:m:${Math.floor(now.getTime() / 60_000)}`,
    );
    expect(windows.dayKey).toBe("kernel:app-quota:mra_1:d:2026-10-05");
    expect(windows.minuteResetSeconds).toBe(10);
    expect(windows.dayResetSeconds).toBe(11 * 3600 + 25 * 60 + 10);
  });

  it("refuses past the minute limit with the seconds left in the window", () => {
    const decision = decide({
      limits: { perMinute: 2, perDay: 10, source: "custom" },
      minuteUsed: 3,
      dayUsed: 3,
      minuteResetSeconds: 10,
      dayResetSeconds: 1_000,
    });
    expect(decision).toMatchObject({
      allowed: false,
      exceeded: "minute",
      retryAfterSeconds: 10,
    });
  });

  it("refuses past the day limit until the day ends", () => {
    expect(
      decide({
        limits: { perMinute: 100, perDay: 10, source: "custom" },
        minuteUsed: 1,
        dayUsed: 11,
        minuteResetSeconds: 10,
        dayResetSeconds: 1_000,
      }),
    ).toMatchObject({
      allowed: false,
      exceeded: "day",
      retryAfterSeconds: 1_000,
    });
  });

  it("writes RateLimit-Policy and RateLimit as structured fields", () => {
    expect(
      rateLimitHeaders({
        limits: { perMinute: 100, perDay: 20_000, source: "default" },
        minuteUsed: 63,
        dayUsed: 500,
        minuteResetSeconds: 21,
        dayResetSeconds: 40_210,
      }),
    ).toEqual({
      "RateLimit-Policy": '"minute";q=100;w=60, "day";q=20000;w=86400',
      RateLimit: '"minute";r=37;t=21, "day";r=19500;t=40210',
    });
  });

  it("validates the RDR's override", () => {
    expect(validateQuotaOverride({ perMinute: 10, perDay: null })).toEqual({
      quotaPerMinute: 10,
      quotaPerDay: null,
    });
    expect(() => validateQuotaOverride({ perMinute: 0 })).toThrow(/entre 1/);
    expect(() => validateQuotaOverride({ perMinute: 1.5 })).toThrow();
    expect(() => validateQuotaOverride({ perMinute: 50, perDay: 10 })).toThrow(
      /no puede ser menor/,
    );
  });
});

describe("AppQuotaService", () => {
  function redis() {
    const store = new Map<string, number>();
    return {
      store,
      incr: jest.fn(async (key: string) => {
        store.set(key, (store.get(key) ?? 0) + 1);
        return store.get(key);
      }),
      pexpire: jest.fn(),
      get: jest.fn(async (key: string) => store.get(key)),
    };
  }
  const response = () => {
    const headers: Record<string, string> = {};
    return {
      headers,
      setHeader: (name: string, value: string) => (headers[name] = value),
    };
  };
  const app = { clientId: "mra_1", quotaPerMinute: 2, approvedAt: new Date() };
  const now = new Date("2026-10-05T12:34:50Z");

  it("counts, sets headers, and answers 429 with Retry-After past the limit", async () => {
    const cache = redis();
    const service = new AppQuotaService(cache as any, defaults);
    const first = response();
    await service.consume(app, first, now);
    expect(first.headers.RateLimit).toBe(
      '"minute";r=1;t=10, "day";r=19999;t=41110',
    );
    await service.consume(app, response(), now);
    const third = response();
    const error = await service
      .consume(app, third, now)
      .catch((caught) => caught);
    expect(error).toBeInstanceOf(AppRateLimitedException);
    expect(error.getStatus()).toBe(429);
    expect(error.getResponse()).toMatchObject({ code: "KERNEL_RATE_LIMITED" });
    expect(third.headers["Retry-After"]).toBe("10");
    expect(third.headers.RateLimit).toContain('"minute";r=0;t=10');
    // A request refused for the minute did not count for the day.
    expect(cache.store.get("kernel:app-quota:mra_1:d:2026-10-05")).toBe(2);
    expect(cache.pexpire).toHaveBeenCalledTimes(2);
  });

  it("keeps apps apart and counts in memory when Redis is down", async () => {
    const service = new AppQuotaService(
      {
        incr: jest.fn().mockResolvedValue(undefined),
        get: jest.fn().mockResolvedValue(undefined),
        pexpire: jest.fn(),
      } as any,
      defaults,
    );
    await service.consume(app, undefined, now);
    await service.consume(app, undefined, now);
    await service.consume({ ...app, clientId: "mra_2" }, undefined, now);
    await expect(service.consume(app, undefined, now)).rejects.toBeInstanceOf(
      AppRateLimitedException,
    );
    expect((await service.usage(app, now)).minuteUsed).toBe(3);
  });

  it("does nothing when quotas are disabled", async () => {
    const cache = redis();
    const service = new AppQuotaService(cache as any, {
      ...defaults,
      enabled: false,
    });
    expect(await service.consume(app, undefined, now)).toBeUndefined();
    expect(cache.incr).not.toHaveBeenCalled();
  });
});
