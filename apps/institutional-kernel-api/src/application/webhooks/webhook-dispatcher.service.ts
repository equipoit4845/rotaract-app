import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import {
  DeveloperAppStatus,
  Prisma,
  WebhookDeliveryStatus,
  WebhookEndpointStatus,
} from "@prisma/client";

import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CommandExecutorService } from "../shared/command-executor.service";
import {
  MAPPED_INTERNAL_TYPES,
  organizationTree,
  planPublicEvent,
  renderForApp,
  resolvePublicEvent,
} from "./event-mapper";
import { postWebhook, type DeliveryResult } from "./http-delivery";
import {
  RETRY_WINDOW_MS,
  nextAttemptAt,
  shouldAutoDisable,
} from "./retry-schedule";
import { decryptSecret } from "./secret-box";
import { webhookHeaders } from "./signing";
import { webhookUrlPolicy, type LookupAll } from "./ssrf-guard";

const FANOUT_BATCH = 200;
const FANOUT_MAX_BATCHES = 50;
const DELIVERY_BATCH = 50;
const DELIVERY_CONCURRENCY = 10;

export type DispatchStats = {
  fannedOut: number;
  deliveriesCreated: number;
  attempted: number;
  succeeded: number;
  failed: number;
};

/**
 * E7 dispatcher. Runs in the worker process (KERNEL_JOBS_ENABLED=true in
 * docker-compose; the API container runs with it off), never in a request.
 *
 * 1. Fan-out: outbox rows not yet seen by webhooks
 *    (`webhooksFannedOutAt IS NULL`) are claimed with
 *    `FOR UPDATE SKIP LOCKED`, mapped to the public catalog and turned into
 *    one WebhookDelivery per interested endpoint (unique per endpoint and
 *    event, so a repeated fan-out can't duplicate). Same transaction marks
 *    the rows as fanned out.
 * 2. Delivery: due deliveries are leased (`lockedUntil`) with
 *    `FOR UPDATE SKIP LOCKED`, so several workers never send the same
 *    attempt; each is signed, POSTed (10 s, SSRF-guarded) and rescheduled
 *    with backoff until 72 h, then FAILED. An endpoint whose attempts all
 *    failed for 72 h is disabled.
 *
 * Delivery is at-least-once: receivers deduplicate on MiRotaract-Webhook-Id.
 */
@Injectable()
export class WebhookDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhookDispatcherService.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  /** Test seam: DNS used by the SSRF guard. */
  lookupAll?: LookupAll;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly commands: CommandExecutorService,
  ) {}

  onModuleInit(): void {
    if (
      process.env.KERNEL_JOBS_ENABLED === "false" ||
      process.env.KERNEL_WEBHOOKS_DISPATCH_ENABLED === "false"
    )
      return;
    this.timer = setInterval(
      () => void this.tick(),
      Number(process.env.KERNEL_WEBHOOKS_DISPATCH_INTERVAL_MS ?? 5_000),
    );
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.runOnce();
    } catch (error) {
      this.logger.error(error);
    } finally {
      this.running = false;
    }
  }

  async runOnce(): Promise<DispatchStats> {
    const stats: DispatchStats = {
      fannedOut: 0,
      deliveriesCreated: 0,
      attempted: 0,
      succeeded: 0,
      failed: 0,
    };
    for (let batch = 0; batch < FANOUT_MAX_BATCHES; batch++) {
      const result = await this.fanOut();
      stats.fannedOut += result.messages;
      stats.deliveriesCreated += result.deliveries;
      if (result.messages < FANOUT_BATCH) break;
    }
    const delivered = await this.deliverDue();
    stats.attempted = delivered.attempted;
    stats.succeeded = delivered.succeeded;
    stats.failed = delivered.failed;
    return stats;
  }

  async fanOut(): Promise<{ messages: number; deliveries: number }> {
    return this.prisma.$transaction(
      async (tx) => {
        const claimed = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM "OutboxMessage"
          WHERE "webhooksFannedOutAt" IS NULL
          ORDER BY "occurredAt" ASC, id ASC
          LIMIT ${FANOUT_BATCH}
          FOR UPDATE SKIP LOCKED`;
        if (claimed.length === 0) return { messages: 0, deliveries: 0 };
        const ids = claimed.map((row) => row.id);
        const endpoints = await tx.webhookEndpoint.findMany({
          where: {
            status: WebhookEndpointStatus.ENABLED,
            app: { status: DeveloperAppStatus.ACTIVE },
          },
          include: {
            app: { select: { id: true, organizationId: true, scopes: true } },
          },
        });
        const deliveries: Prisma.WebhookDeliveryCreateManyInput[] = [];
        if (endpoints.length > 0) {
          const messages = await tx.outboxMessage.findMany({
            where: {
              id: { in: ids },
              eventType: { in: MAPPED_INTERNAL_TYPES },
            },
            orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
          });
          const trees = new Map<string, Set<string>>();
          const tree = async (rootId: string) => {
            let ids = trees.get(rootId);
            if (!ids) {
              ids = new Set(await organizationTree(tx, rootId));
              trees.set(rootId, ids);
            }
            return ids;
          };
          const now = new Date();
          const retryUntil = new Date(now.getTime() + RETRY_WINDOW_MS);
          for (const message of messages) {
            const plan = planPublicEvent(message);
            if (!plan) continue;
            const interested = endpoints.filter((endpoint) =>
              endpoint.eventTypes.includes(plan.type),
            );
            if (interested.length === 0) continue;
            const event = await resolvePublicEvent(tx, message, plan);
            if (!event) continue;
            for (const endpoint of interested) {
              const rendered = renderForApp(event, {
                appId: endpoint.app.id,
                scopes: endpoint.app.scopes,
                organizationIds: await tree(endpoint.app.organizationId),
              });
              if (!rendered) continue;
              deliveries.push({
                endpointId: endpoint.id,
                eventId: rendered.envelope.id,
                eventType: rendered.envelope.type,
                outboxMessageId: message.id,
                organizationId: rendered.envelope.organizationId,
                payload: rendered.body,
                nextAttemptAt: now,
                retryUntil,
              });
            }
          }
          if (deliveries.length)
            await tx.webhookDelivery.createMany({
              data: deliveries,
              skipDuplicates: true,
            });
        }
        await tx.outboxMessage.updateMany({
          where: { id: { in: ids } },
          data: { webhooksFannedOutAt: new Date() },
        });
        return { messages: ids.length, deliveries: deliveries.length };
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
  }

  /** Claims due deliveries (lease) and sends them. */
  async deliverDue(limit = DELIVERY_BATCH): Promise<{
    attempted: number;
    succeeded: number;
    failed: number;
  }> {
    // Timestamps are compared in UTC on the database side: the columns are
    // TIMESTAMP(3) without time zone holding UTC (Prisma's convention).
    // The 60 s lease is well above the 10 s HTTP budget.
    const claimed = await this.prisma.$queryRaw<Array<{ id: string }>>`
      UPDATE "WebhookDelivery"
      SET "lockedUntil" = (now() AT TIME ZONE 'UTC') + interval '60 seconds'
      WHERE id IN (
        SELECT d.id FROM "WebhookDelivery" d
        JOIN "WebhookEndpoint" e ON e.id = d."endpointId"
        JOIN "DeveloperApp" a ON a.id = e."appId"
        WHERE d.status = 'PENDING'
          AND d."nextAttemptAt" <= (now() AT TIME ZONE 'UTC')
          AND (d."lockedUntil" IS NULL OR d."lockedUntil" < (now() AT TIME ZONE 'UTC'))
          AND e.status = 'ENABLED'
          AND a.status = 'ACTIVE'
        ORDER BY d."nextAttemptAt" ASC
        LIMIT ${limit}
        FOR UPDATE OF d SKIP LOCKED
      )
      RETURNING id`;
    let succeeded = 0;
    let failed = 0;
    for (let i = 0; i < claimed.length; i += DELIVERY_CONCURRENCY) {
      const results = await Promise.all(
        claimed
          .slice(i, i + DELIVERY_CONCURRENCY)
          .map((row) => this.attempt(row.id)),
      );
      for (const ok of results)
        if (ok) succeeded++;
        else failed++;
    }
    return { attempted: claimed.length, succeeded, failed };
  }

  /** One signed POST and its bookkeeping. Returns whether it was delivered. */
  private async attempt(deliveryId: string): Promise<boolean> {
    const delivery = await this.prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
      include: {
        endpoint: { include: { app: { select: { organizationId: true } } } },
      },
    });
    if (!delivery || delivery.status !== WebhookDeliveryStatus.PENDING)
      return false;
    const { endpoint } = delivery;
    const started = new Date();
    let result: DeliveryResult;
    try {
      const secrets = [decryptSecret(endpoint.secretEnc)];
      if (
        endpoint.previousSecretEnc &&
        endpoint.previousSecretExpiresAt &&
        endpoint.previousSecretExpiresAt > started
      )
        secrets.push(decryptSecret(endpoint.previousSecretEnc));
      result = await postWebhook({
        url: endpoint.url,
        headers: webhookHeaders({
          eventId: delivery.eventId,
          timestamp: Math.floor(started.getTime() / 1_000),
          body: delivery.payload,
          secrets,
        }),
        body: delivery.payload,
        policy: webhookUrlPolicy(),
        lookupAll: this.lookupAll,
      });
    } catch (error) {
      // e.g. a secret that can't be decrypted (KERNEL_SIGNING_KEY_SECRET changed)
      result = {
        ok: false,
        status: null,
        responseExcerpt: null,
        latencyMs: Date.now() - started.getTime(),
        error: `No se pudo firmar el envío: ${(error as Error).message}`,
      };
    }
    const now = new Date();
    const attempts = delivery.attempts + 1;
    const common = {
      attempts,
      firstAttemptAt: delivery.firstAttemptAt ?? started,
      lastAttemptAt: started,
      lastResponseStatus: result.status,
      lastResponseBody: result.responseExcerpt,
      lastLatencyMs: result.latencyMs,
      lastError: result.error,
      lockedUntil: null,
    };
    if (result.ok) {
      await this.prisma.$transaction([
        this.prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            ...common,
            status: WebhookDeliveryStatus.SUCCEEDED,
            deliveredAt: now,
            nextAttemptAt: null,
          },
        }),
        this.prisma.webhookEndpoint.update({
          where: { id: endpoint.id },
          data: {
            failingSince: null,
            consecutiveFailures: 0,
            lastSuccessAt: now,
          },
        }),
      ]);
      return true;
    }
    const next = nextAttemptAt({
      failedAttempts: attempts,
      now,
      retryUntil: delivery.retryUntil,
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          ...common,
          status: next
            ? WebhookDeliveryStatus.PENDING
            : WebhookDeliveryStatus.FAILED,
          nextAttemptAt: next,
        },
      });
      await tx.webhookEndpoint.updateMany({
        where: { id: endpoint.id, failingSince: null },
        data: { failingSince: started },
      });
      const updated = await tx.webhookEndpoint.update({
        where: { id: endpoint.id },
        data: {
          consecutiveFailures: { increment: 1 },
          lastFailureAt: now,
        },
      });
      if (
        updated.status === WebhookEndpointStatus.ENABLED &&
        shouldAutoDisable(updated.failingSince, now)
      ) {
        await tx.webhookEndpoint.update({
          where: { id: endpoint.id },
          data: {
            status: WebhookEndpointStatus.DISABLED,
            disabledAt: now,
            disabledReason: "AUTO_FAILURES",
          },
        });
        await this.audit.record(
          tx,
          this.commands.systemContext("AutoDisableWebhookEndpoint"),
          "autoDisableWebhookEndpoint",
          "WebhookEndpoint",
          endpoint.id,
          endpoint.app.organizationId,
        );
        this.logger.warn(
          `Webhook endpoint ${endpoint.id} disabled after 72 h of failed deliveries`,
        );
      }
    });
    return false;
  }
}
