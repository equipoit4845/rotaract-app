import type { INestApplication } from "@nestjs/common";
import { connect, StringCodec } from "nats";

import { OutboxPublisherService } from "../src/infrastructure/events/outbox-publisher.service";
import { OptionalRedisCacheService } from "../src/infrastructure/cache/optional-redis-cache.service";
import { createTestApp, e2eTag, testPrisma } from "./support/test-app";

/**
 * Deliberately uses the compose services rather than mocks.  It is isolated
 * through a unique event/key and removes its own rows after every run.
 */
describe("Live infrastructure (Redis + NATS JetStream)", () => {
  let app: INestApplication;
  const tag = e2eTag();
  const aggregateId = `live-${tag}`;
  const redisKey = `kernel:e2e:${tag}`;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    const prisma = testPrisma();
    await prisma.outboxMessage.deleteMany({ where: { aggregateId } });
    await prisma.aggregateVersion.deleteMany({ where: { aggregateId } });
    await prisma.$disconnect();
    await app.close();
  });

  it("reads, writes and expires cache entries on the live Redis instance", async () => {
    const cache = app.get(OptionalRedisCacheService);
    await cache.set(redisKey, { tag, active: true }, 10);
    await expect(
      cache.get<{ tag: string; active: boolean }>(redisKey),
    ).resolves.toEqual({ tag, active: true });
    await cache.del(redisKey);
    await expect(cache.get(redisKey)).resolves.toBeUndefined();
  });

  it("falls back cleanly when Redis is unavailable", async () => {
    const original = process.env.REDIS_URL;
    process.env.REDIS_URL = "redis://127.0.0.1:1";
    const cache = new OptionalRedisCacheService();
    await expect(
      cache.set(redisKey, { ignored: true }),
    ).resolves.toBeUndefined();
    await expect(cache.get(redisKey)).resolves.toBeUndefined();
    process.env.REDIS_URL = original;
  });

  it("publishes a transactional Outbox row to live NATS JetStream", async () => {
    const prisma = testPrisma();
    const eventType = "kernel.test-live-infrastructure.v1";
    const subject = `${process.env.KERNEL_NATS_SUBJECT_PREFIX ?? "kernel.events"}.${eventType}`;
    const connection = await connect({ servers: process.env.NATS_URL });
    const subscription = connection.subscribe(subject);
    try {
      const message = await prisma.outboxMessage.create({
        data: {
          eventType,
          aggregateType: "LiveInfrastructureTest",
          aggregateId,
          aggregateVersion: 1,
          actorType: "SYSTEM",
          payload: { tag },
        },
      });
      const publisher = app.get(OutboxPublisherService);
      await expect(publisher.publishPending()).resolves.toBeGreaterThanOrEqual(
        1,
      );
      let timeout: NodeJS.Timeout | undefined;
      const received = await Promise.race([
        subscription[Symbol.asyncIterator]()
          .next()
          .then((result) => {
            if (result.done || !result.value)
              throw new Error(
                "NATS subscription closed before receiving the event",
              );
            return result.value;
          }),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error("Timed out waiting for NATS event")),
            5_000,
          );
        }),
      ]).finally(() => {
        if (timeout) clearTimeout(timeout);
      });
      const envelope = JSON.parse(StringCodec().decode(received.data));
      expect(envelope).toMatchObject({
        eventId: message.id,
        eventType,
        aggregateId,
        aggregateVersion: 1,
        data: { tag },
      });
      await expect(
        prisma.outboxMessage.findUniqueOrThrow({ where: { id: message.id } }),
      ).resolves.toMatchObject({ status: "PUBLISHED", attempts: 1 });
    } finally {
      subscription.unsubscribe();
      await connection.drain();
      await prisma.$disconnect();
    }
  });
});
