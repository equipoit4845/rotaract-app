import { Injectable } from "@nestjs/common";
import { ActorType, Prisma } from "@prisma/client";
import { CommandContext } from "../../domain/shared/command-context";

@Injectable()
export class OutboxService {
  async record(
    tx: Prisma.TransactionClient,
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    payload: Prisma.InputJsonValue,
    context?: CommandContext,
    tenantId?: string,
  ): Promise<void> {
    const version = await tx.aggregateVersion.upsert({
      where: { aggregateType_aggregateId: { aggregateType, aggregateId } },
      create: { aggregateType, aggregateId, version: 1 },
      update: { version: { increment: 1 } },
    });
    await tx.outboxMessage.create({
      data: {
        eventType,
        aggregateType,
        aggregateId,
        aggregateVersion: version.version,
        tenantId,
        actorType: (context?.actor.type ?? "SYSTEM") as ActorType,
        actorId: context?.actor.id,
        correlationId: context?.correlationId,
        causationId: context?.causationId ?? context?.commandId,
        traceId: context?.traceId,
        payload,
      },
    });
  }
}
