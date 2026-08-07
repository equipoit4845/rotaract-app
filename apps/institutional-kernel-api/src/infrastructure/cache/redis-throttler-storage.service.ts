import { Injectable } from "@nestjs/common";
import { ThrottlerStorage, ThrottlerStorageService } from "@nestjs/throttler";
import { OptionalRedisCacheService } from "./optional-redis-cache.service";

type ThrottlerStorageRecord = {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
};

/**
 * §14.1: rate limits must be distributed across replicas, not per-process.
 * Backed by the same best-effort Redis client used for authorization
 * caching. If Redis is unreachable, falls back to the in-memory
 * ThrottlerStorageService that @nestjs/throttler ships by default —
 * per-instance limiting rather than no limiting at all.
 */
@Injectable()
export class RedisThrottlerStorageService implements ThrottlerStorage {
  private readonly fallback = new ThrottlerStorageService();
  constructor(private readonly cache: OptionalRedisCacheService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const hitsKey = `kernel:throttle:${throttlerName}:${key}`;
    const blockKey = `kernel:throttle-block:${throttlerName}:${key}`;

    const blockTtlMs = await this.cache.pttl(blockKey);
    if (blockTtlMs !== undefined) {
      return {
        totalHits: limit + 1,
        timeToExpire: 0,
        isBlocked: true,
        timeToBlockExpire: Math.ceil(blockTtlMs / 1_000),
      };
    }

    const totalHits = await this.cache.incr(hitsKey);
    if (totalHits === undefined)
      return this.fallback.increment(
        key,
        ttl,
        limit,
        blockDuration,
        throttlerName,
      );

    if (totalHits === 1) await this.cache.pexpire(hitsKey, ttl);
    const remainingMs = (await this.cache.pttl(hitsKey)) ?? ttl;
    const isBlocked = totalHits > limit;
    if (isBlocked && blockDuration > 0)
      await this.cache.set(blockKey, 1, Math.ceil(blockDuration / 1_000));

    return {
      totalHits,
      timeToExpire: Math.max(0, Math.ceil(remainingMs / 1_000)),
      isBlocked,
      timeToBlockExpire: isBlocked ? Math.ceil(blockDuration / 1_000) : 0,
    };
  }
}
