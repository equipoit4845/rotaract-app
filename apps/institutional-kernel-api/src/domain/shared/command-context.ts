export type CommandContext = {
  commandId: string;
  actor: { type: "USER" | "SERVICE" | "SYSTEM"; id?: string };
  correlationId?: string;
  causationId?: string;
  traceId?: string;
  idempotencyKey?: string;
  operation?: string;
  ipAddress?: string;
  userAgent?: string;
};
