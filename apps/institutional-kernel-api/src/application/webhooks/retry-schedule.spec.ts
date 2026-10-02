import {
  AUTO_DISABLE_AFTER_MS,
  RETRY_WINDOW_MS,
  baseRetryDelayMs,
  nextAttemptAt,
  plannedAttemptOffsetsMs,
  retryDelayMs,
  shouldAutoDisable,
} from "./retry-schedule";

const MIN = 60_000;
const HOUR = 60 * MIN;

describe("webhook retry schedule", () => {
  it("follows 1m, 5m, 30m, 2h, 6h, 12h and then every 12h", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 20].map(baseRetryDelayMs)).toEqual([
      1 * MIN,
      5 * MIN,
      30 * MIN,
      2 * HOUR,
      6 * HOUR,
      12 * HOUR,
      12 * HOUR,
      12 * HOUR,
    ]);
  });

  it("adds at most ±10 % jitter", () => {
    expect(retryDelayMs(1, () => 0.5)).toBe(MIN);
    expect(retryDelayMs(1, () => 0)).toBe(0.9 * MIN);
    expect(retryDelayMs(1, () => 0.999999)).toBeCloseTo(1.1 * MIN, -1);
    for (let i = 0; i < 200; i++) {
      const delay = retryDelayMs(4);
      expect(delay).toBeGreaterThanOrEqual(0.9 * 2 * HOUR);
      expect(delay).toBeLessThanOrEqual(1.1 * 2 * HOUR);
    }
  });

  it("plans attempts for exactly 72 h, the last one clamped to the deadline", () => {
    const offsets = plannedAttemptOffsetsMs();
    expect(offsets.slice(0, 7)).toEqual([
      0,
      1 * MIN,
      6 * MIN,
      36 * MIN,
      2 * HOUR + 36 * MIN,
      8 * HOUR + 36 * MIN,
      20 * HOUR + 36 * MIN,
    ]);
    expect(offsets[offsets.length - 1]).toBe(RETRY_WINDOW_MS);
    expect(offsets).toHaveLength(12);
  });

  it("gives up once the window is over", () => {
    const created = new Date("2026-10-01T00:00:00Z");
    const retryUntil = new Date(created.getTime() + RETRY_WINDOW_MS);
    const mid = nextAttemptAt({
      failedAttempts: 1,
      now: created,
      retryUntil,
      random: () => 0.5,
    });
    expect(mid?.getTime()).toBe(created.getTime() + MIN);
    const late = new Date(retryUntil.getTime() - MIN);
    expect(
      nextAttemptAt({ failedAttempts: 9, now: late, retryUntil })?.getTime(),
    ).toBe(retryUntil.getTime());
    expect(
      nextAttemptAt({ failedAttempts: 10, now: retryUntil, retryUntil }),
    ).toBeNull();
  });

  it("makes a manual redelivery a single attempt (retryUntil = now)", () => {
    const now = new Date();
    expect(
      nextAttemptAt({ failedAttempts: 1, now, retryUntil: now }),
    ).toBeNull();
  });

  it("auto-disables only after 72 h of uninterrupted failures", () => {
    const now = new Date("2026-10-04T00:00:00Z");
    expect(shouldAutoDisable(null, now)).toBe(false);
    expect(
      shouldAutoDisable(
        new Date(now.getTime() - AUTO_DISABLE_AFTER_MS + 1),
        now,
      ),
    ).toBe(false);
    expect(
      shouldAutoDisable(new Date(now.getTime() - AUTO_DISABLE_AFTER_MS), now),
    ).toBe(true);
  });
});
