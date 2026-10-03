import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { DeveloperAppStatus } from "@prisma/client";

import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { scopeLabel } from "../oauth/scopes";
import { describeAccess, historyOptionsFromEnv } from "./access-history";

export type MyAppAccess = {
  appId: string;
  appName: string;
  organizationName: string;
  appStatus: DeveloperAppStatus;
  /** The person let it in with "Ingresar con Mi Rotaract" (and can take it back). */
  connected: boolean;
  grantedAt: Date | null;
  scopes: Array<{ scope: string; label: string }>;
  lastAccessAt: Date | null;
  accessCount: number;
};

/**
 * E11.2 — a person's own view of which apps reached their data, and the
 * retention of that history. Every query is keyed by the signed-in person:
 * there is no way to ask for somebody else's history.
 */
@Injectable()
export class AccessHistoryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AccessHistoryService.name);
  private timer?: NodeJS.Timeout;
  private readonly options = historyOptionsFromEnv();

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    if (process.env.KERNEL_JOBS_ENABLED === "false") return;
    this.timer = setInterval(
      () =>
        void this.purgeExpired().catch((error) =>
          this.logger.warn(`Access history retention failed: ${String(error)}`),
        ),
      Number(
        process.env.KERNEL_ACCESS_HISTORY_RETENTION_INTERVAL_MS ?? 3_600_000,
      ),
    );
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async listForPerson(personId: string): Promise<MyAppAccess[]> {
    const since = this.retentionStart();
    const [consents, grouped] = await Promise.all([
      this.prisma.oAuthConsent.findMany({
        where: { personId, revokedAt: null },
        select: { appId: true, scopes: true, grantedAt: true },
      }),
      this.prisma.personAppAccess.groupBy({
        by: ["appId"],
        where: { personId, createdAt: { gte: since } },
        _count: { _all: true },
        _max: { createdAt: true },
      }),
    ]);
    const appIds = [
      ...new Set([
        ...consents.map((consent) => consent.appId),
        ...grouped.map((group) => group.appId),
      ]),
    ];
    if (appIds.length === 0) return [];
    const apps = await this.prisma.developerApp.findMany({
      where: { id: { in: appIds } },
      select: {
        id: true,
        name: true,
        status: true,
        organization: { select: { name: true } },
      },
    });
    const consentByApp = new Map(consents.map((c) => [c.appId, c]));
    const usageByApp = new Map(grouped.map((g) => [g.appId, g]));
    return apps
      .map((app) => {
        const consent =
          app.status === DeveloperAppStatus.REVOKED
            ? undefined
            : consentByApp.get(app.id);
        const usage = usageByApp.get(app.id);
        return {
          appId: app.id,
          appName: app.name,
          organizationName: app.organization.name,
          appStatus: app.status,
          connected: !!consent,
          grantedAt: consent?.grantedAt ?? null,
          scopes: (consent?.scopes ?? []).map((scope) => ({
            scope,
            label: scopeLabel(scope),
          })),
          lastAccessAt: usage?._max.createdAt ?? null,
          accessCount: usage?._count._all ?? 0,
        };
      })
      .sort(
        (a, b) =>
          Number(b.connected) - Number(a.connected) ||
          (b.lastAccessAt?.getTime() ?? 0) - (a.lastAccessAt?.getTime() ?? 0) ||
          a.appName.localeCompare(b.appName),
      );
  }

  async eventsForPerson(
    personId: string,
    appId: string,
    query: Record<string, unknown>,
  ): Promise<{
    items: Array<{
      id: string;
      kind: string;
      details: string[];
      description: string;
      occurredAt: Date;
    }>;
    pageInfo: { hasMore: boolean; nextCursor: string | null };
  }> {
    const limit = query.limit === undefined ? 25 : Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new BadRequestException("limit debe estar entre 1 y 100");
    const cursor = typeof query.cursor === "string" ? query.cursor : undefined;
    const where = {
      personId,
      appId,
      createdAt: { gte: this.retentionStart() },
    };
    if (cursor) {
      // The cursor must be one of this person's own rows.
      const anchor = await this.prisma.personAppAccess.findFirst({
        where: { id: cursor, personId, appId },
        select: { id: true },
      });
      if (!anchor) throw new BadRequestException("cursor inválido");
    }
    const rows = await this.prisma.personAppAccess.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : undefined,
      take: limit + 1,
    });
    const items = rows.slice(0, limit);
    const hasMore = rows.length > limit;
    return {
      items: items.map((row) => ({
        id: row.id,
        kind: row.kind,
        details: row.details,
        description: describeAccess(row.kind, row.details),
        occurredAt: row.createdAt,
      })),
      pageInfo: {
        hasMore,
        nextCursor: hasMore ? items[items.length - 1].id : null,
      },
    };
  }

  /** Deletes rows older than the retention (365 days by default). */
  async purgeExpired(now = new Date()): Promise<number> {
    const { count } = await this.prisma.personAppAccess.deleteMany({
      where: { createdAt: { lt: this.retentionStart(now) } },
    });
    if (count > 0) this.logger.log(`Expired ${count} access history entries`);
    return count;
  }

  private retentionStart(now = new Date()): Date {
    return new Date(
      now.getTime() - this.options.retentionDays * 24 * 60 * 60 * 1000,
    );
  }
}
