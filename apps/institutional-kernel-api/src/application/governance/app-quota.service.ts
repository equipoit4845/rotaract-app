import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Optional,
} from "@nestjs/common";

import { OptionalRedisCacheService } from "../../infrastructure/cache/optional-redis-cache.service";
import {
  decide,
  quotaDefaultsFromEnv,
  quotaLimitsFor,
  quotaWindows,
  rateLimitHeaders,
  type QuotaDecision,
  type QuotaDefaults,
  type QuotaUsage,
} from "./app-quota";

export type QuotaApp = {
  clientId: string;
  quotaPerMinute?: number | null;
  quotaPerDay?: number | null;
  approvedAt?: Date | string | null;
};

type HeaderTarget = { setHeader(name: string, value: string): unknown };

export const APP_QUOTA_DEFAULTS = "APP_QUOTA_DEFAULTS";

export const RATE_LIMITED_CODE = "KERNEL_RATE_LIMITED";

/** 429 Problem Details with code KERNEL_RATE_LIMITED (ProblemFilter renders it). */
export class AppRateLimitedException extends HttpException {
  constructor(
    detail: string,
    readonly retryAfterSeconds: number,
  ) {
    super(
      { code: RATE_LIMITED_CODE, message: detail },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/**
 * E11.3 — counts every request an app makes (service token, a person's
 * token issued to the app, or its client credentials at /oauth/token and
 * /oauth/revoke) against its per-minute and per-day quota, keyed by
 * client_id. Counters live in Redis so they hold across replicas; if Redis
 * is down, each process counts in memory (the per-IP limiter still applies).
 */
@Injectable()
export class AppQuotaService {
  private readonly memory = new Map<
    string,
    { count: number; expires: number }
  >();
  readonly defaults: QuotaDefaults;

  constructor(
    private readonly cache: OptionalRedisCacheService,
    @Optional() @Inject(APP_QUOTA_DEFAULTS) defaults?: QuotaDefaults,
  ) {
    this.defaults = defaults ?? quotaDefaultsFromEnv();
  }

  get enabled(): boolean {
    return this.defaults.enabled;
  }

  /**
   * Counts one request. Always sets RateLimit-Policy / RateLimit on the
   * response; over quota, also Retry-After, and throws a 429.
   */
  async consume(
    app: QuotaApp,
    response: HeaderTarget | undefined,
    now = new Date(),
  ): Promise<QuotaDecision | undefined> {
    if (!this.enabled) return undefined;
    const limits = quotaLimitsFor(app, this.defaults);
    const windows = quotaWindows(app.clientId, now);
    const minuteUsed = await this.increment(
      windows.minuteKey,
      windows.minuteTtlMs,
      now,
    );
    // A request refused for the minute does not eat into the day.
    const dayUsed =
      minuteUsed > limits.perMinute
        ? await this.read(windows.dayKey, now)
        : await this.increment(windows.dayKey, windows.dayTtlMs, now);
    const decision = decide({
      limits,
      minuteUsed,
      dayUsed,
      minuteResetSeconds: windows.minuteResetSeconds,
      dayResetSeconds: windows.dayResetSeconds,
    });
    if (response)
      for (const [name, value] of Object.entries(rateLimitHeaders(decision)))
        response.setHeader(name, value);
    if (!decision.allowed) {
      const retryAfter = decision.retryAfterSeconds ?? 1;
      response?.setHeader("Retry-After", String(retryAfter));
      throw new AppRateLimitedException(
        decision.exceeded === "day"
          ? `La app superó su límite de ${limits.perDay} pedidos por día. Probá de nuevo en ${retryAfter} s.`
          : `La app superó su límite de ${limits.perMinute} pedidos por minuto. Probá de nuevo en ${retryAfter} s.`,
        retryAfter,
      );
    }
    return decision;
  }

  /** Current usage, without counting (for the console). */
  async usage(app: QuotaApp, now = new Date()): Promise<QuotaUsage> {
    const limits = quotaLimitsFor(app, this.defaults);
    const windows = quotaWindows(app.clientId, now);
    return {
      limits,
      minuteUsed: await this.read(windows.minuteKey, now),
      dayUsed: await this.read(windows.dayKey, now),
      minuteResetSeconds: windows.minuteResetSeconds,
      dayResetSeconds: windows.dayResetSeconds,
    };
  }

  private async increment(
    key: string,
    ttlMs: number,
    now: Date,
  ): Promise<number> {
    const count = await this.cache.incr(key);
    if (count !== undefined) {
      if (count === 1) await this.cache.pexpire(key, ttlMs);
      return count;
    }
    this.sweep(now);
    const entry = this.memory.get(key);
    if (!entry || entry.expires <= now.getTime()) {
      this.memory.set(key, { count: 1, expires: now.getTime() + ttlMs });
      return 1;
    }
    entry.count += 1;
    return entry.count;
  }

  private async read(key: string, now: Date): Promise<number> {
    const value = await this.cache.get<number>(key);
    if (typeof value === "number") return value;
    const entry = this.memory.get(key);
    return entry && entry.expires > now.getTime() ? entry.count : 0;
  }

  private sweep(now: Date): void {
    if (this.memory.size < 10_000) return;
    for (const [key, entry] of this.memory)
      if (entry.expires <= now.getTime()) this.memory.delete(key);
  }
}
