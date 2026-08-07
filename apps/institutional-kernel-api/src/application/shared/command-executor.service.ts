import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHash, randomUUID } from "crypto";
import { CommandContext } from "../../domain/shared/command-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

@Injectable()
export class CommandExecutorService {
  constructor(private readonly prisma: PrismaService) {}
  async execute<T extends object>(
    operation: string,
    context: CommandContext,
    request: object,
    handler: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    const actorScope = `${context.actor.type}:${context.actor.id ?? "system"}`;
    if (!context.idempotencyKey) return this.serializable(handler);
    const requestHash = createHash("sha256")
      .update(this.canonicalJson(request))
      .digest("hex");
    const expiry = new Date(Date.now() + 24 * 60 * 60_000);
    return this.serializable(async (tx) => {
      const existing = await tx.idempotencyKey.findUnique({
        where: {
          key_operation_actorScope: {
            key: context.idempotencyKey!,
            operation,
            actorScope,
          },
        },
      });
      if (existing?.completedAt) {
        if (existing.requestHash !== requestHash)
          throw new ConflictException(
            "Idempotency key was already used with another request",
          );
        return existing.responseBody as unknown as T;
      }
      if (existing && existing.requestHash !== requestHash)
        throw new ConflictException(
          "Idempotency key is in progress with another request",
        );
      if (!existing) {
        try {
          await tx.idempotencyKey.create({
            data: {
              key: context.idempotencyKey!,
              operation,
              actorScope,
              requestHash,
              expiresAt: expiry,
              lockedUntil: new Date(Date.now() + 60_000),
            },
          });
        } catch (error) {
          if ((error as { code?: string }).code === "P2002")
            throw new ConflictException(
              "Idempotency key is currently being processed",
            );
          throw error;
        }
      }
      const result = await handler(tx);
      await tx.idempotencyKey.update({
        where: {
          key_operation_actorScope: {
            key: context.idempotencyKey!,
            operation,
            actorScope,
          },
        },
        data: {
          responseStatus: 200,
          responseBody: result as Prisma.InputJsonValue,
          completedAt: new Date(),
          lockedUntil: null,
        },
      });
      return result;
    });
  }
  private async serializable<T>(
    handler: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(handler, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const code = (error as { code?: string }).code;
        if ((code === "P2034" || code === "40001") && attempt < 2) continue;
        if (code === "P2034" || code === "40001")
          throw new ServiceUnavailableException(
            "Concurrent institutional update; retry the command",
          );
        // A unique-constraint violation (e.g. application_one_open,
        // transfer_one_open) is a business conflict, not a server error —
        // surface it as 409 instead of letting it fall through as a raw
        // Prisma error that the problem filter maps to 500.
        if (code === "P2002") {
          const target = (error as { meta?: { target?: string[] | string } })
            .meta?.target;
          const fields = Array.isArray(target) ? target.join(", ") : target;
          throw new ConflictException(
            fields
              ? `A conflicting record already exists (${fields})`
              : "A conflicting record already exists",
          );
        }
        throw error;
      }
    }
    throw new ServiceUnavailableException(
      "Could not obtain a serializable transaction",
    );
  }
  private canonicalJson(value: unknown): string {
    if (Array.isArray(value))
      return `[${value.map((item) => this.canonicalJson(item)).join(",")}]`;
    if (value && typeof value === "object") {
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right));
      return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${this.canonicalJson(item)}`).join(",")}}`;
    }
    return JSON.stringify(value);
  }
  systemContext(operation: string): CommandContext {
    return {
      commandId: randomUUID(),
      actor: { type: "SYSTEM" },
      correlationId: operation,
    };
  }
}
