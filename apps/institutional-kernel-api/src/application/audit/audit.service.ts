import { Injectable } from "@nestjs/common";
import { ActorType, Prisma } from "@prisma/client";
import { CommandContext } from "../../domain/shared/command-context";

@Injectable()
export class AuditService {
  record(
    tx: Prisma.TransactionClient,
    context: CommandContext,
    action: string,
    resourceType: string,
    resourceId: string,
    organizationId?: string,
    result: "SUCCESS" | "FAILURE" = "SUCCESS",
  ): Promise<unknown> {
    return tx.kernelAuditLog.create({
      data: {
        actorType: context.actor.type as ActorType,
        actorId: context.actor.id,
        action,
        resourceType,
        resourceId,
        organizationId,
        result,
        traceId: context.traceId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: {
          commandId: context.commandId,
          correlationId: context.correlationId,
          causationId: context.causationId,
        },
      },
    });
  }
}
