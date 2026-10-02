import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  DeveloperAppStatus,
  Prisma,
  WebhookDeliveryStatus,
  WebhookEndpointStatus,
  type WebhookDelivery,
  type WebhookEndpoint,
} from "@prisma/client";
import { randomBytes } from "crypto";

import type { CommandContext } from "../../domain/shared/command-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CommandExecutorService } from "../shared/command-executor.service";
import { allowInput } from "../shared/input-allowlist";
import {
  PING_EVENT_TYPE,
  SUBSCRIBABLE_EVENT_TYPES,
  eventDefinition,
  type PublicEnvelope,
} from "./catalog";
import { encryptSecret } from "./secret-box";
import { newWebhookSecret } from "./signing";
import {
  WebhookUrlError,
  resolvePublicAddresses,
  validateWebhookUrl,
  webhookUrlPolicy,
} from "./ssrf-guard";

type Tx = Prisma.TransactionClient;

/** A rotated-out secret keeps signing (second `v1=`) this long. */
export const WEBHOOK_SECRET_GRACE_MS = 24 * 60 * 60 * 1_000;
export const MAX_ENDPOINTS_PER_APP = 10;

export type WebhookEndpointView = {
  id: string;
  appId: string;
  url: string;
  description: string | null;
  eventTypes: string[];
  status: WebhookEndpointStatus;
  disabledReason: string | null;
  disabledAt: Date | null;
  secretHint: string;
  previousSecretExpiresAt: Date | null;
  secretRotatedAt: Date | null;
  failingSince: Date | null;
  consecutiveFailures: number;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type WebhookDeliveryView = {
  id: string;
  endpointId: string;
  eventId: string;
  eventType: string;
  organizationId: string | null;
  status: WebhookDeliveryStatus;
  attempts: number;
  nextAttemptAt: Date | null;
  retryUntil: Date;
  firstAttemptAt: Date | null;
  lastAttemptAt: Date | null;
  lastResponseStatus: number | null;
  lastResponseBody: string | null;
  lastLatencyMs: number | null;
  lastError: string | null;
  deliveredAt: Date | null;
  createdAt: Date;
};

/** Explicit projection: never the encrypted secrets. */
export function toEndpointView(endpoint: WebhookEndpoint): WebhookEndpointView {
  const graceActive =
    endpoint.previousSecretExpiresAt &&
    endpoint.previousSecretExpiresAt > new Date();
  return {
    id: endpoint.id,
    appId: endpoint.appId,
    url: endpoint.url,
    description: endpoint.description ?? null,
    eventTypes: endpoint.eventTypes,
    status: endpoint.status,
    disabledReason: endpoint.disabledReason ?? null,
    disabledAt: endpoint.disabledAt ?? null,
    secretHint: endpoint.secretHint,
    previousSecretExpiresAt: graceActive
      ? endpoint.previousSecretExpiresAt
      : null,
    secretRotatedAt: endpoint.secretRotatedAt ?? null,
    failingSince: endpoint.failingSince ?? null,
    consecutiveFailures: endpoint.consecutiveFailures,
    lastSuccessAt: endpoint.lastSuccessAt ?? null,
    lastFailureAt: endpoint.lastFailureAt ?? null,
    createdAt: endpoint.createdAt,
    updatedAt: endpoint.updatedAt,
  };
}

/** Explicit projection: the signed body (it may carry personal data) stays out. */
export function toDeliveryView(delivery: WebhookDelivery): WebhookDeliveryView {
  return {
    id: delivery.id,
    endpointId: delivery.endpointId,
    eventId: delivery.eventId,
    eventType: delivery.eventType,
    organizationId: delivery.organizationId ?? null,
    status: delivery.status,
    attempts: delivery.attempts,
    nextAttemptAt:
      delivery.status === WebhookDeliveryStatus.PENDING
        ? (delivery.nextAttemptAt ?? null)
        : null,
    retryUntil: delivery.retryUntil,
    firstAttemptAt: delivery.firstAttemptAt ?? null,
    lastAttemptAt: delivery.lastAttemptAt ?? null,
    lastResponseStatus: delivery.lastResponseStatus ?? null,
    lastResponseBody: delivery.lastResponseBody ?? null,
    lastLatencyMs: delivery.lastLatencyMs ?? null,
    lastError: delivery.lastError ?? null,
    deliveredAt: delivery.deliveredAt ?? null,
    createdAt: delivery.createdAt,
  };
}

function bad(message: string): never {
  throw new BadRequestException(message);
}

/** Validates the subscription list against the catalog and the app's scopes. */
export function validateEventTypes(
  value: unknown,
  appScopes: readonly string[],
): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
    bad("eventTypes debe ser una lista de tipos de evento");
  const types = [...new Set(value as string[])];
  if (types.length === 0) bad("Elegí al menos un evento");
  for (const type of types) {
    const definition = eventDefinition(type);
    if (!definition || !SUBSCRIBABLE_EVENT_TYPES.includes(type))
      bad(`Evento desconocido: ${type}`);
    if (definition.scope && !appScopes.includes(definition.scope))
      bad(
        `Para recibir ${type} la app necesita el permiso ${definition.scope}`,
      );
  }
  return types;
}

function description(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") bad("La descripción debe ser un texto");
  if (value.length > 200)
    bad("La descripción puede tener hasta 200 caracteres");
  return value.trim() || null;
}

/** Syntax, https and (unless sandbox) a public destination after DNS. */
export async function checkDestination(value: unknown): Promise<string> {
  const policy = webhookUrlPolicy();
  try {
    const url = validateWebhookUrl(value, policy);
    await resolvePublicAddresses(new URL(url).hostname, policy);
    return url;
  } catch (error) {
    if (error instanceof WebhookUrlError) bad(error.message);
    throw error;
  }
}

export function newEventId(): string {
  return `evt_${randomBytes(12).toString("hex")}`;
}

/**
 * E7 — management of an app's webhook endpoints (kernel-openapi.yaml tag
 * Webhooks). Authorization is the guard's (same permissions as the app);
 * this service only checks that the endpoint belongs to the app.
 * Delivery itself runs in the worker (WebhookDispatcherService).
 */
@Injectable()
export class WebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commands: CommandExecutorService,
    private readonly audit: AuditService,
  ) {}

  async list(appId: string): Promise<WebhookEndpointView[]> {
    await this.app(this.prisma, appId);
    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: { appId },
      orderBy: { createdAt: "asc" },
    });
    return endpoints.map(toEndpointView);
  }

  async get(appId: string, endpointId: string): Promise<WebhookEndpointView> {
    return toEndpointView(await this.endpoint(this.prisma, appId, endpointId));
  }

  async create(
    appId: string,
    input: unknown,
    context: CommandContext,
  ): Promise<{ endpoint: WebhookEndpointView; secret: string }> {
    const request = allowInput(
      "createWebhookEndpoint",
      input as Record<string, unknown>,
    );
    this.actor(context);
    const url = await checkDestination(request.url);
    const text = description(request.description);
    // Generated outside the (retryable) transaction; the plaintext never
    // reaches the idempotency record or the audit log.
    const secret = newWebhookSecret();
    const secretEnc = encryptSecret(secret.secret);
    let createdHere: string | undefined;
    const result = await this.commands.execute(
      "createWebhookEndpoint",
      context,
      { appId, ...request },
      async (tx) => {
        const app = await this.app(tx, appId);
        if (app.status === DeveloperAppStatus.REVOKED)
          throw new ConflictException(
            "Una app revocada no puede recibir eventos",
          );
        const eventTypes = validateEventTypes(request.eventTypes, app.scopes);
        const count = await tx.webhookEndpoint.count({ where: { appId } });
        if (count >= MAX_ENDPOINTS_PER_APP)
          throw new ConflictException(
            `Una app puede tener hasta ${MAX_ENDPOINTS_PER_APP} endpoints`,
          );
        const created = await tx.webhookEndpoint.create({
          data: {
            appId,
            url,
            description: text,
            eventTypes,
            secretEnc,
            secretHint: secret.hint,
            createdById: context.actor.id,
          },
        });
        await this.record(tx, context, "createWebhookEndpoint", created, app);
        createdHere = created.id;
        return { endpoint: toEndpointView(created) };
      },
    );
    if (createdHere !== result.endpoint.id)
      throw new ConflictException(
        "Ese secreto ya se entregó una vez y no se puede volver a mostrar; rotalo para obtener uno nuevo",
      );
    return { endpoint: result.endpoint, secret: secret.secret };
  }

  async update(
    appId: string,
    endpointId: string,
    input: unknown,
    context: CommandContext,
  ): Promise<WebhookEndpointView> {
    const request = allowInput(
      "updateWebhookEndpoint",
      input as Record<string, unknown>,
    );
    this.actor(context);
    const url =
      request.url === undefined
        ? undefined
        : await checkDestination(request.url);
    if (
      request.status !== undefined &&
      request.status !== WebhookEndpointStatus.ENABLED &&
      request.status !== WebhookEndpointStatus.DISABLED
    )
      bad("status debe ser ENABLED o DISABLED");
    return this.commands.execute(
      "updateWebhookEndpoint",
      context,
      { appId, endpointId, ...request },
      async (tx) => {
        const app = await this.app(tx, appId);
        const endpoint = await this.endpoint(tx, appId, endpointId);
        const data: Prisma.WebhookEndpointUpdateInput = {};
        if (url !== undefined) data.url = url;
        if ("description" in request)
          data.description = description(request.description);
        if (request.eventTypes !== undefined)
          data.eventTypes = validateEventTypes(request.eventTypes, app.scopes);
        if (request.status === "ENABLED" && endpoint.status !== "ENABLED") {
          if (app.status === DeveloperAppStatus.REVOKED)
            throw new ConflictException(
              "Una app revocada no puede recibir eventos",
            );
          Object.assign(data, {
            status: WebhookEndpointStatus.ENABLED,
            disabledAt: null,
            disabledReason: null,
            // A fresh start: the 72 h failure streak counts from now on.
            failingSince: null,
            consecutiveFailures: 0,
          });
        }
        if (request.status === "DISABLED" && endpoint.status !== "DISABLED")
          Object.assign(data, {
            status: WebhookEndpointStatus.DISABLED,
            disabledAt: new Date(),
            disabledReason: "MANUAL",
          });
        const updated = await tx.webhookEndpoint.update({
          where: { id: endpointId },
          data,
        });
        await this.record(tx, context, "updateWebhookEndpoint", updated, app);
        return toEndpointView(updated);
      },
    );
  }

  async remove(
    appId: string,
    endpointId: string,
    context: CommandContext,
  ): Promise<void> {
    this.actor(context);
    await this.commands.execute(
      "deleteWebhookEndpoint",
      context,
      { appId, endpointId },
      async (tx) => {
        const app = await this.app(tx, appId);
        const endpoint = await this.endpoint(tx, appId, endpointId);
        await tx.webhookEndpoint.delete({ where: { id: endpointId } });
        await this.record(tx, context, "deleteWebhookEndpoint", endpoint, app);
        return { id: endpointId };
      },
    );
  }

  /**
   * New secret, shown once. The previous one keeps signing for 24 h (a
   * second `v1=` in MiRotaract-Signature) so the receiver can be updated
   * without rejecting events in between.
   */
  async rotateSecret(
    appId: string,
    endpointId: string,
    context: CommandContext,
  ): Promise<{
    endpoint: WebhookEndpointView;
    secret: string;
  }> {
    this.actor(context);
    const secret = newWebhookSecret();
    const secretEnc = encryptSecret(secret.secret);
    let rotatedHere = false;
    const result = await this.commands.execute(
      "rotateWebhookSecret",
      context,
      { appId, endpointId },
      async (tx) => {
        const app = await this.app(tx, appId);
        const endpoint = await this.endpoint(tx, appId, endpointId);
        const now = new Date();
        const updated = await tx.webhookEndpoint.update({
          where: { id: endpointId },
          data: {
            secretEnc,
            secretHint: secret.hint,
            previousSecretEnc: endpoint.secretEnc,
            previousSecretExpiresAt: new Date(
              now.getTime() + WEBHOOK_SECRET_GRACE_MS,
            ),
            secretRotatedAt: now,
          },
        });
        await this.record(tx, context, "rotateWebhookSecret", updated, app);
        rotatedHere = true;
        return { endpoint: toEndpointView(updated) };
      },
    );
    if (!rotatedHere)
      throw new ConflictException(
        "Ese secreto ya se entregó una vez y no se puede volver a mostrar; rotalo de nuevo",
      );
    return { endpoint: result.endpoint, secret: secret.secret };
  }

  /** Queues a `ping.v1` for this endpoint; the worker sends it within seconds. */
  async sendTest(
    appId: string,
    endpointId: string,
    context: CommandContext,
  ): Promise<WebhookDeliveryView> {
    this.actor(context);
    return this.commands.execute(
      "sendWebhookTest",
      context,
      { appId, endpointId },
      async (tx) => {
        const app = await this.app(tx, appId);
        const endpoint = await this.endpoint(tx, appId, endpointId);
        if (endpoint.status !== WebhookEndpointStatus.ENABLED)
          throw new ConflictException(
            "El endpoint está desactivado: activalo para mandarle una prueba",
          );
        if (app.status !== DeveloperAppStatus.ACTIVE)
          throw new ConflictException(
            "La app no está activa: reactivala para mandar una prueba",
          );
        const now = new Date();
        const envelope: PublicEnvelope = {
          id: newEventId(),
          type: PING_EVENT_TYPE,
          createdAt: now.toISOString(),
          organizationId: app.organizationId,
          data: {
            message: "Hola desde Mi Rotaract",
            appId,
            endpointId,
          },
        };
        const delivery = await tx.webhookDelivery.create({
          data: {
            endpointId,
            eventId: envelope.id,
            eventType: envelope.type,
            organizationId: app.organizationId,
            payload: JSON.stringify(envelope),
            nextAttemptAt: now,
            // A test is one shot: no retry schedule behind it.
            retryUntil: now,
          },
        });
        await this.record(tx, context, "sendWebhookTest", endpoint, app);
        return toDeliveryView(delivery);
      },
    );
  }

  async listDeliveries(
    appId: string,
    endpointId: string,
    query: { status?: unknown; cursor?: unknown; limit?: unknown },
  ): Promise<{
    items: WebhookDeliveryView[];
    pageInfo: { hasMore: boolean; nextCursor: string | null };
  }> {
    await this.endpoint(this.prisma, appId, endpointId);
    const status =
      typeof query.status === "string" && query.status
        ? query.status
        : undefined;
    if (status && !(status in WebhookDeliveryStatus))
      bad("status debe ser PENDING, SUCCEEDED o FAILED");
    const limit = Math.min(Math.max(Number(query.limit ?? 25) || 25, 1), 100);
    const cursor =
      typeof query.cursor === "string" && query.cursor
        ? query.cursor
        : undefined;
    const rows = await this.prisma.webhookDelivery.findMany({
      where: {
        endpointId,
        status: status as WebhookDeliveryStatus | undefined,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : undefined,
      take: limit + 1,
    });
    const items = rows.slice(0, limit);
    return {
      items: items.map(toDeliveryView),
      pageInfo: {
        hasMore: rows.length > limit,
        nextCursor: rows.length > limit ? items[items.length - 1].id : null,
      },
    };
  }

  /**
   * Manual redelivery from the console: the same event (same id and body)
   * once more, now. It is a single attempt — if it fails it goes back to
   * FAILED; it does not restart the 72 h schedule.
   */
  async redeliver(
    appId: string,
    endpointId: string,
    deliveryId: string,
    context: CommandContext,
  ): Promise<WebhookDeliveryView> {
    this.actor(context);
    return this.commands.execute(
      "redeliverWebhook",
      context,
      { appId, endpointId, deliveryId },
      async (tx) => {
        const app = await this.app(tx, appId);
        const endpoint = await this.endpoint(tx, appId, endpointId);
        if (endpoint.status !== WebhookEndpointStatus.ENABLED)
          throw new ConflictException(
            "El endpoint está desactivado: activalo para reenviar",
          );
        const delivery = await tx.webhookDelivery.findFirst({
          where: { id: deliveryId, endpointId },
        });
        if (!delivery) throw new NotFoundException("Envío no encontrado");
        const now = new Date();
        const updated = await tx.webhookDelivery.update({
          where: { id: deliveryId },
          data: {
            status: WebhookDeliveryStatus.PENDING,
            nextAttemptAt: now,
            retryUntil:
              delivery.status === WebhookDeliveryStatus.PENDING
                ? delivery.retryUntil
                : now,
            lockedUntil: null,
          },
        });
        await this.record(tx, context, "redeliverWebhook", endpoint, app);
        return toDeliveryView(updated);
      },
    );
  }

  private async app(client: Tx | PrismaService, appId: string) {
    const app = await client.developerApp.findUnique({
      where: { id: appId },
      select: { id: true, organizationId: true, status: true, scopes: true },
    });
    if (!app) throw new NotFoundException("App no encontrada");
    return app;
  }

  private async endpoint(
    client: Tx | PrismaService,
    appId: string,
    endpointId: string,
  ): Promise<WebhookEndpoint> {
    const endpoint = await client.webhookEndpoint.findFirst({
      where: { id: endpointId, appId },
    });
    if (!endpoint) throw new NotFoundException("Endpoint no encontrado");
    return endpoint;
  }

  private actor(context: CommandContext): string {
    if (context.actor.type !== "USER" || !context.actor.id)
      bad("Esta operación requiere una persona autenticada");
    return context.actor.id;
  }

  /** Never secrets: which endpoint of which app, by whom, where. */
  private record(
    tx: Tx,
    context: CommandContext,
    action: string,
    endpoint: Pick<WebhookEndpoint, "id">,
    app: { organizationId: string },
  ) {
    return this.audit.record(
      tx,
      context,
      action,
      "WebhookEndpoint",
      endpoint.id,
      app.organizationId,
    );
  }
}
