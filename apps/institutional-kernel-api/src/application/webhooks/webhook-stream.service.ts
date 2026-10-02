import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { DeveloperAppStatus, type DeveloperApp } from "@prisma/client";
import type { Request, Response } from "express";

import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { ClientAuthenticator } from "../oauth/client-authenticator";
import { OAuthError } from "../oauth/oauth-error";
import { SUBSCRIBABLE_EVENT_TYPES, eventDefinition } from "./catalog";
import {
  MAPPED_INTERNAL_TYPES,
  organizationTree,
  planPublicEvent,
  renderForApp,
  resolvePublicEvent,
} from "./event-mapper";
import { newWebhookSecret, webhookHeaders } from "./signing";

const POLL_MS = 1_000;
const HEARTBEAT_MS = 15_000;
const REFRESH_MS = 60_000;
/** Rows may commit a little after their occurredAt; look back this far. */
const LOOKBACK_MS = 10_000;

export function webhookStreamEnabled(env = process.env): boolean {
  return env.KERNEL_WEBHOOK_STREAM_ENABLED === "true";
}

/** `Authorization: Basic base64(urlencode(client_id):urlencode(secret))` (RFC 6749 §2.3.1). */
export function parseBasicCredentials(
  header: string | undefined,
): { clientId: string; clientSecret: string } | null {
  const encoded = header?.match(/^Basic\s+(.+)$/i)?.[1];
  if (!encoded) return null;
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const colon = decoded.indexOf(":");
  if (colon < 0) return null;
  try {
    return {
      clientId: decodeURIComponent(decoded.slice(0, colon)),
      clientSecret: decodeURIComponent(decoded.slice(colon + 1)),
    };
  } catch {
    return null;
  }
}

function sse(event: string, data: unknown, id?: string): string {
  return `event: ${event}\n${id ? `id: ${id}\n` : ""}data: ${JSON.stringify(data)}\n\n`;
}

/**
 * Development stream for `mirotaract webhooks listen` (E6). Emits every
 * event the app would receive by webhook, exactly as it would be POSTed
 * (same body, same headers), signed with a per-stream secret announced in
 * the first `ready` message. Authenticated with the app's client
 * credentials, not a person's session. Off unless
 * KERNEL_WEBHOOK_STREAM_ENABLED=true (local kernel / sandbox).
 *
 * It reads the outbox directly, so it works without any registered
 * endpoint and without the worker.
 */
@Injectable()
export class WebhookStreamService {
  private readonly logger = new Logger(WebhookStreamService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clients: ClientAuthenticator,
  ) {}

  async open(
    appId: string,
    request: Request,
    response: Response,
  ): Promise<void> {
    if (!webhookStreamEnabled())
      throw new NotFoundException(
        "El stream de eventos solo está disponible en un kernel local o de pruebas",
      );
    const credentials = parseBasicCredentials(request.headers.authorization);
    let app: DeveloperApp;
    try {
      if (!credentials) throw new OAuthError("invalid_client");
      app = await this.clients.authenticate(credentials);
    } catch (error) {
      if (error instanceof OAuthError) {
        response.setHeader("WWW-Authenticate", 'Basic realm="mirotaract"');
        throw new UnauthorizedException(
          "Credenciales de la app inválidas (client_id y secreto, por Basic auth)",
        );
      }
      throw error;
    }
    if (app.id !== appId)
      throw new ForbiddenException("Esas credenciales no son de esta app");

    const types = this.requestedTypes(request.query.events, app.scopes);
    const secret = newWebhookSecret().secret;
    let tree = new Set(await organizationTree(this.prisma, app.organizationId));

    response.status(200);
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.setHeader("X-Accel-Buffering", "no");
    response.flushHeaders();
    response.write(
      sse("ready", {
        secret,
        appId: app.id,
        clientId: app.clientId,
        organizationId: app.organizationId,
        events: types,
      }),
    );

    // Only what happens from now on (no history replay).
    const openedAt = new Date();
    let cursor = openedAt;
    const seen = new Map<string, number>();
    let closed = false;
    let polling = false;
    let lastRefresh = Date.now();

    const poll = async () => {
      if (closed || polling) return;
      polling = true;
      try {
        if (Date.now() - lastRefresh > REFRESH_MS) {
          lastRefresh = Date.now();
          const current = await this.prisma.developerApp.findUnique({
            where: { id: app.id },
            select: { status: true, scopes: true },
          });
          if (!current || current.status !== DeveloperAppStatus.ACTIVE) {
            response.write(sse("end", { reason: "La app ya no está activa" }));
            return close();
          }
          app = { ...app, scopes: current.scopes };
          tree = new Set(
            await organizationTree(this.prisma, app.organizationId),
          );
        }
        const since = new Date(
          Math.max(openedAt.getTime(), cursor.getTime() - LOOKBACK_MS),
        );
        const rows = await this.prisma.outboxMessage.findMany({
          where: {
            occurredAt: { gte: since },
            eventType: { in: MAPPED_INTERNAL_TYPES },
          },
          orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
          take: 200,
        });
        for (const row of rows) {
          if (closed) return;
          if (seen.has(row.id)) continue;
          seen.set(row.id, row.occurredAt.getTime());
          if (row.occurredAt > cursor) cursor = row.occurredAt;
          const plan = planPublicEvent(row);
          if (!plan || !types.includes(plan.type)) continue;
          const event = await resolvePublicEvent(this.prisma, row, plan);
          if (!event) continue;
          const rendered = renderForApp(event, {
            scopes: app.scopes,
            organizationIds: tree,
          });
          if (!rendered) continue;
          const headers = webhookHeaders({
            eventId: rendered.envelope.id,
            timestamp: Math.floor(Date.now() / 1_000),
            body: rendered.body,
            secrets: [secret],
          });
          response.write(
            sse(
              "webhook",
              { headers, body: rendered.body },
              rendered.envelope.id,
            ),
          );
        }
        const horizon = cursor.getTime() - LOOKBACK_MS * 2;
        for (const [id, at] of seen) if (at < horizon) seen.delete(id);
      } catch (error) {
        this.logger.warn(
          `Webhook stream poll failed: ${(error as Error).message}`,
        );
      } finally {
        polling = false;
      }
    };

    const pollTimer = setInterval(() => void poll(), POLL_MS);
    const heartbeat = setInterval(() => {
      if (!closed) response.write(": keepalive\n\n");
    }, HEARTBEAT_MS);
    const close = () => {
      if (closed) return;
      closed = true;
      clearInterval(pollTimer);
      clearInterval(heartbeat);
      response.end();
    };
    request.on("close", close);
  }

  /** `?events=a,b` ∩ what the app's scopes allow; default: all it may receive. */
  private requestedTypes(value: unknown, scopes: string[]): string[] {
    const allowed = SUBSCRIBABLE_EVENT_TYPES.filter((type) => {
      const scope = eventDefinition(type)?.scope;
      return !scope || scopes.includes(scope);
    });
    if (typeof value !== "string" || !value.trim()) return allowed;
    const requested = [
      ...new Set(
        value
          .split(",")
          .map((type) => type.trim())
          .filter(Boolean),
      ),
    ];
    for (const type of requested) {
      if (!SUBSCRIBABLE_EVENT_TYPES.includes(type))
        throw new BadRequestException(`Evento desconocido: ${type}`);
      if (!allowed.includes(type))
        throw new BadRequestException(
          `Para recibir ${type} la app necesita el permiso ${eventDefinition(type)?.scope}`,
        );
    }
    return requested;
  }
}
