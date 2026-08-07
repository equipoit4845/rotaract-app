import { Global, Module } from "@nestjs/common";
import { OptionalRedisCacheService } from "./optional-redis-cache.service";
import { RedisThrottlerStorageService } from "./redis-throttler-storage.service";

// Global so the async ThrottlerModule factory (a separate dynamic module)
// can inject RedisThrottlerStorageService without a manual imports wiring.
@Global()
@Module({
  providers: [OptionalRedisCacheService, RedisThrottlerStorageService],
  exports: [OptionalRedisCacheService, RedisThrottlerStorageService],
})
export class CacheModule {}
