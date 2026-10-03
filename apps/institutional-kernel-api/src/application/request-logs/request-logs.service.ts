import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../../infrastructure/prisma/prisma.service";

export const REQUEST_LOG_RETENTION_DAYS = 30;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export type RequestLogFilters = {
  status?: { gte: number; lt: number } | { equals: number };
  code?: string;
  traceId?: string;
  from?: Date;
  to?: Date;
  cursor?: string;
  limit: number;
};

export type RequestLogView = {
  id: string;
  appId: string;
  method: string;
  route: string;
  status: number;
  code: string | null;
  type: string | null;
  latencyMs: number;
  traceId: string;
  clientIp: string | null;
  createdAt: Date;
};

const bad = (message: string): never => {
  throw new BadRequestException(message);
};

function text(value: unknown, name: string, max = 128): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") return bad(`${name} debe ser un texto`);
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > max) bad(`${name} es demasiado largo`);
  return trimmed;
}

function instant(value: unknown, name: string): Date | undefined {
  const raw = text(value, name, 64);
  if (!raw) return undefined;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime()))
    bad(`${name} debe ser un instante ISO 8601`);
  return date;
}

/**
 * Parses the query of `GET /developer/apps/{appId}/request-logs`. `status`
 * accepts a class (`4xx`), `error` (any 4xx/5xx) or an exact code (`404`).
 */
export function parseRequestLogFilters(
  query: Record<string, unknown>,
): RequestLogFilters {
  const filters: RequestLogFilters = { limit: DEFAULT_LIMIT };
  const status = text(query.status, "status", 5)?.toLowerCase();
  if (status) {
    if (status === "error") filters.status = { gte: 400, lt: 600 };
    else if (/^[1-5]xx$/.test(status)) {
      const base = Number(status[0]) * 100;
      filters.status = { gte: base, lt: base + 100 };
    } else if (/^[1-5]\d\d$/.test(status))
      filters.status = { equals: Number(status) };
    else bad("status debe ser 2xx, 3xx, 4xx, 5xx, error o un código HTTP");
  }
  filters.code = text(query.code, "code");
  filters.traceId = text(query.traceId, "traceId");
  filters.from = instant(query.from, "from");
  filters.to = instant(query.to, "to");
  if (filters.from && filters.to && filters.from >= filters.to)
    bad("from tiene que ser anterior a to");
  filters.cursor = text(query.cursor, "cursor", 64);
  if (query.limit !== undefined && query.limit !== "") {
    const limit = Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT)
      bad(`limit debe ser un entero entre 1 y ${MAX_LIMIT}`);
    filters.limit = limit;
  }
  return filters;
}

export function requestLogWhere(
  appId: string,
  filters: RequestLogFilters,
): Prisma.DeveloperAppRequestLogWhereInput {
  const where: Prisma.DeveloperAppRequestLogWhereInput = { appId };
  if (filters.status) where.status = filters.status;
  if (filters.code) where.problemCode = filters.code;
  if (filters.traceId) where.traceId = filters.traceId;
  if (filters.from || filters.to)
    where.createdAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lt: filters.to } : {}),
    };
  return where;
}

/** E9.3 — reading an app's request logs and expiring old ones. */
@Injectable()
export class RequestLogsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RequestLogsService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  /** The retention job runs where the other jobs run (the worker). */
  onModuleInit(): void {
    if (process.env.KERNEL_JOBS_ENABLED === "false") return;
    this.timer = setInterval(
      () =>
        void this.purgeExpired().catch((error) =>
          this.logger.warn(`Request log retention failed: ${String(error)}`),
        ),
      Number(
        process.env.KERNEL_REQUEST_LOGS_RETENTION_INTERVAL_MS ?? 3_600_000,
      ),
    );
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async list(
    appId: string,
    query: Record<string, unknown>,
  ): Promise<{
    items: RequestLogView[];
    pageInfo: { hasMore: boolean; nextCursor: string | null };
  }> {
    const filters = parseRequestLogFilters(query);
    const app = await this.prisma.developerApp.findUnique({
      where: { id: appId },
      select: { id: true },
    });
    if (!app) throw new NotFoundException("App no encontrada");
    if (filters.cursor) {
      const anchor = await this.prisma.developerAppRequestLog.findFirst({
        where: { id: filters.cursor, appId },
        select: { id: true },
      });
      if (!anchor) bad("cursor inválido");
    }
    const rows = await this.prisma.developerAppRequestLog.findMany({
      where: requestLogWhere(appId, filters),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      cursor: filters.cursor ? { id: filters.cursor } : undefined,
      skip: filters.cursor ? 1 : undefined,
      take: filters.limit + 1,
    });
    const items = rows.slice(0, filters.limit);
    const hasMore = rows.length > filters.limit;
    return {
      items: items.map((row) => ({
        id: row.id,
        appId: row.appId,
        method: row.method,
        route: row.route,
        status: row.status,
        code: row.problemCode,
        type: row.problemType,
        latencyMs: row.latencyMs,
        traceId: row.traceId,
        clientIp: row.clientIp,
        createdAt: row.createdAt,
      })),
      pageInfo: {
        hasMore,
        nextCursor: hasMore ? items[items.length - 1].id : null,
      },
    };
  }

  /** Deletes rows older than 30 days. Idempotent; safe on every replica. */
  async purgeExpired(now = new Date()): Promise<number> {
    const before = new Date(
      now.getTime() - REQUEST_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    const { count } = await this.prisma.developerAppRequestLog.deleteMany({
      where: { createdAt: { lt: before } },
    });
    if (count > 0) this.logger.log(`Expired ${count} request log entries`);
    return count;
  }
}
