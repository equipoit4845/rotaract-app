/**
 * E11.3 — per-app quotas (docs/18-data-governance.md §Cuotas,
 * docs/developers/limites.md). Pure: limits, windows and headers. The
 * counters live in Redis (AppQuotaService).
 */

export type QuotaSource = "default" | "review" | "custom";

export type QuotaLimits = {
  perMinute: number;
  perDay: number;
  /** Where the limits come from: the environment default, the in-review default, or the RDR. */
  source: QuotaSource;
};

export type QuotaDefaults = {
  enabled: boolean;
  perMinute: number;
  perDay: number;
  reviewPerMinute: number;
  reviewPerDay: number;
};

export const QUOTA_BOUNDS = {
  perMinute: { min: 1, max: 100_000 },
  perDay: { min: 1, max: 10_000_000 },
} as const;

export function quotaDefaultsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): QuotaDefaults {
  const number = (value: string | undefined, fallback: number) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  };
  return {
    enabled: env.KERNEL_APP_QUOTAS_ENABLED !== "false",
    perMinute: number(env.KERNEL_APP_QUOTA_PER_MINUTE, 100),
    perDay: number(env.KERNEL_APP_QUOTA_PER_DAY, 20_000),
    reviewPerMinute: number(env.KERNEL_APP_REVIEW_QUOTA_PER_MINUTE, 20),
    reviewPerDay: number(env.KERNEL_APP_REVIEW_QUOTA_PER_DAY, 1_000),
  };
}

/**
 * The RDR's override wins; otherwise an app that was never approved gets
 * the (lower) in-review defaults and an approved one the normal defaults.
 */
export function quotaLimitsFor(
  app: {
    quotaPerMinute?: number | null;
    quotaPerDay?: number | null;
    approvedAt?: Date | string | null;
  },
  defaults: QuotaDefaults,
): QuotaLimits {
  const inReview = !app.approvedAt;
  const perMinute =
    app.quotaPerMinute ??
    (inReview ? defaults.reviewPerMinute : defaults.perMinute);
  const perDay =
    app.quotaPerDay ?? (inReview ? defaults.reviewPerDay : defaults.perDay);
  const source: QuotaSource =
    app.quotaPerMinute != null || app.quotaPerDay != null
      ? "custom"
      : inReview
        ? "review"
        : "default";
  return { perMinute, perDay, source };
}

export type QuotaWindows = {
  minuteKey: string;
  dayKey: string;
  /** Seconds until each window resets (at least 1). */
  minuteResetSeconds: number;
  dayResetSeconds: number;
  minuteTtlMs: number;
  dayTtlMs: number;
};

/** Fixed windows: the current UTC minute and the current UTC day. */
export function quotaWindows(clientId: string, now: Date): QuotaWindows {
  const ms = now.getTime();
  const minuteStart = Math.floor(ms / 60_000) * 60_000;
  const dayStart = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const minuteEnd = minuteStart + 60_000;
  const dayEnd = dayStart + 86_400_000;
  const day = new Date(dayStart).toISOString().slice(0, 10);
  return {
    minuteKey: `kernel:app-quota:${clientId}:m:${minuteStart / 60_000}`,
    dayKey: `kernel:app-quota:${clientId}:d:${day}`,
    minuteResetSeconds: Math.max(1, Math.ceil((minuteEnd - ms) / 1_000)),
    dayResetSeconds: Math.max(1, Math.ceil((dayEnd - ms) / 1_000)),
    // A little longer than the window, so a key never outlives its use by much.
    minuteTtlMs: minuteEnd - ms + 60_000,
    dayTtlMs: dayEnd - ms + 3_600_000,
  };
}

export type QuotaUsage = {
  limits: QuotaLimits;
  minuteUsed: number;
  dayUsed: number;
  minuteResetSeconds: number;
  dayResetSeconds: number;
};

export type QuotaDecision = QuotaUsage & {
  allowed: boolean;
  /** Seconds to wait when not allowed. */
  retryAfterSeconds?: number;
  /** Which window ran out. */
  exceeded?: "minute" | "day";
};

export function decide(usage: QuotaUsage): QuotaDecision {
  if (usage.minuteUsed > usage.limits.perMinute)
    return {
      ...usage,
      allowed: false,
      exceeded: "minute",
      retryAfterSeconds: usage.minuteResetSeconds,
    };
  if (usage.dayUsed > usage.limits.perDay)
    return {
      ...usage,
      allowed: false,
      exceeded: "day",
      retryAfterSeconds: usage.dayResetSeconds,
    };
  return { ...usage, allowed: true };
}

/**
 * RateLimit headers of draft-ietf-httpapi-ratelimit-headers (structured
 * fields): one policy per window, and the remaining quota of each.
 *
 *   RateLimit-Policy: "minute";q=100;w=60, "day";q=20000;w=86400
 *   RateLimit: "minute";r=37;t=21, "day";r=19500;t=40210
 */
export function rateLimitHeaders(usage: QuotaUsage): Record<string, string> {
  const remaining = (limit: number, used: number) => Math.max(0, limit - used);
  return {
    "RateLimit-Policy": `"minute";q=${usage.limits.perMinute};w=60, "day";q=${usage.limits.perDay};w=86400`,
    RateLimit: `"minute";r=${remaining(usage.limits.perMinute, usage.minuteUsed)};t=${usage.minuteResetSeconds}, "day";r=${remaining(usage.limits.perDay, usage.dayUsed)};t=${usage.dayResetSeconds}`,
  };
}

/** Validates the RDR's override; null clears it (back to the default). */
export function validateQuotaOverride(input: Record<string, unknown>): {
  quotaPerMinute: number | null;
  quotaPerDay: number | null;
} {
  const read = (
    field: "perMinute" | "perDay",
    label: string,
  ): number | null => {
    const value = input[field];
    if (value === null || value === undefined) return null;
    const { min, max } = QUOTA_BOUNDS[field];
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < min ||
      value > max
    )
      throw new RangeError(
        `${label} debe ser un número entero entre ${min} y ${max.toLocaleString("es-AR")}`,
      );
    return value;
  };
  const quotaPerMinute = read("perMinute", "El límite por minuto");
  const quotaPerDay = read("perDay", "El límite por día");
  if (
    quotaPerMinute !== null &&
    quotaPerDay !== null &&
    quotaPerDay < quotaPerMinute
  )
    throw new RangeError(
      "El límite por día no puede ser menor que el límite por minuto",
    );
  return { quotaPerMinute, quotaPerDay };
}
