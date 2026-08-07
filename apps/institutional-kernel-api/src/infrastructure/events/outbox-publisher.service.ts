import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { connect, NatsConnection, StringCodec } from "nats";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class OutboxPublisherService implements OnModuleDestroy {
  private readonly logger = new Logger(OutboxPublisherService.name);
  private connection?: NatsConnection;
  private streamReady = false;
  private readonly codec = StringCodec();
  constructor(private readonly prisma: PrismaService) {}
  private async nats(): Promise<NatsConnection> {
    if (!this.connection)
      this.connection = await connect({
        servers: process.env.NATS_URL ?? "nats://nats:4222",
      });
    if (!this.streamReady) {
      const manager = await this.connection.jetstreamManager();
      const stream = process.env.KERNEL_NATS_STREAM ?? "KERNEL_EVENTS";
      try {
        await manager.streams.info(stream);
      } catch {
        await manager.streams.add({
          name: stream,
          subjects: [
            `${process.env.KERNEL_NATS_SUBJECT_PREFIX ?? "kernel.events"}.>`,
          ],
        });
      }
      this.streamReady = true;
    }
    return this.connection;
  }
  async publishPending(limit = 100): Promise<number> {
    const messages = await this.prisma.outboxMessage.findMany({
      where: {
        status: { in: ["PENDING", "FAILED"] },
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
      },
      orderBy: { occurredAt: "asc" },
      take: limit,
    });
    let published = 0;
    for (const message of messages)
      try {
        const nats = await this.nats();
        const envelope = {
          specVersion: "1.0",
          eventId: message.id,
          eventType: message.eventType,
          eventVersion: message.eventVersion,
          source: "institutional-kernel",
          aggregateType: message.aggregateType,
          aggregateId: message.aggregateId,
          aggregateVersion: message.aggregateVersion,
          tenantId: message.tenantId,
          occurredAt: message.occurredAt,
          actor: { type: message.actorType, id: message.actorId },
          correlationId: message.correlationId,
          causationId: message.causationId,
          traceId: message.traceId,
          data: message.payload,
        };
        // JetStream Msg-Id makes a retry of the same Outbox row producer-idempotent.
        await nats
          .jetstream()
          .publish(
            `${process.env.KERNEL_NATS_SUBJECT_PREFIX ?? "kernel.events"}.${message.eventType}`,
            this.codec.encode(JSON.stringify(envelope)),
            { msgID: message.id },
          );
        await this.prisma.outboxMessage.update({
          where: { id: message.id },
          data: {
            status: "PUBLISHED",
            publishedAt: new Date(),
            attempts: { increment: 1 },
            lastError: null,
            nextAttemptAt: null,
          },
        });
        published++;
      } catch (error) {
        const attempts = message.attempts + 1;
        await this.prisma.outboxMessage.update({
          where: { id: message.id },
          data: {
            status: "FAILED",
            attempts,
            nextAttemptAt: new Date(
              Date.now() + Math.min(3_600_000, 1_000 * 2 ** attempts),
            ),
            lastError:
              error instanceof Error ? error.message : "Unknown publish error",
          },
        });
        this.logger.warn(`Outbox publication failed: ${message.id}`);
      }
    return published;
  }
  async onModuleDestroy(): Promise<void> {
    await this.connection?.drain();
  }
}
