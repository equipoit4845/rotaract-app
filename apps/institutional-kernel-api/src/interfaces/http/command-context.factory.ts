import { Injectable } from "@nestjs/common";
import { createHash, randomUUID } from "crypto";
import type { Request } from "express";

import { CommandContext } from "../../domain/shared/command-context";
import { AuthenticatedRequest } from "../../application/auth/jwt-session.guard";

@Injectable()
export class HttpCommandContextFactory {
  from(request: Request, operation: string): CommandContext {
    const authenticated = request as AuthenticatedRequest;
    const actor = authenticated.user
      ? { type: "USER" as const, id: authenticated.user.personId }
      : { type: "SYSTEM" as const, id: undefined };
    const forwarded = request.headers["x-forwarded-for"];
    const ip =
      typeof forwarded === "string"
        ? forwarded.split(",")[0].trim()
        : request.ip;
    return {
      commandId: randomUUID(),
      actor,
      operation,
      correlationId: request.header("x-correlation-id") ?? randomUUID(),
      traceId: request.header("traceparent") ?? undefined,
      idempotencyKey: request.header("idempotency-key") ?? undefined,
      ipAddress: ip,
      userAgent: request.header("user-agent") ?? undefined,
    };
  }
  anonymousScope(request: Request): string {
    return `anonymous:${createHash("sha256")
      .update(request.ip ?? "unknown")
      .digest("hex")
      .slice(0, 16)}`;
  }
}
