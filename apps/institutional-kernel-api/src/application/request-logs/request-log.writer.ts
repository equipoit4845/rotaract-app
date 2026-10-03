import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
  Optional,
} from "@nestjs/common";

import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import type { RequestLogEntry } from "./request-log.context";

export type RequestLogWriterOptions = {
  enabled: boolean;
  flushIntervalMs: number;
  batchSize: number;
  maxBuffered: number;
};

export const REQUEST_LOG_WRITER_OPTIONS = "REQUEST_LOG_WRITER_OPTIONS";

export function writerOptionsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): RequestLogWriterOptions {
  const number = (value: string | undefined, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };
  return {
    enabled: env.KERNEL_REQUEST_LOGS_ENABLED !== "false",
    flushIntervalMs: number(env.KERNEL_REQUEST_LOGS_FLUSH_MS, 1_000),
    batchSize: number(env.KERNEL_REQUEST_LOGS_BATCH_SIZE, 200),
    maxBuffered: number(env.KERNEL_REQUEST_LOGS_MAX_BUFFERED, 10_000),
  };
}

type Store = {
  developerApp: {
    findMany(args: {
      where: { clientId: { in: string[] } };
      select: { id: true; clientId: true };
    }): Promise<Array<{ id: string; clientId: string }>>;
  };
  developerAppRequestLog: {
    createMany(args: {
      data: Array<
        Omit<RequestLogEntry, "clientId" | "appId"> & { appId: string }
      >;
    }): Promise<unknown>;
  };
};

/**
 * E9.3 — buffers request log entries in memory and writes them in batches
 * (`createMany`) off the request path: `record()` is synchronous and never
 * awaits the database, so logging adds no latency. Bounded: past
 * `maxBuffered` new entries are dropped (and counted) rather than growing
 * memory. A failed batch is dropped and logged; logs are diagnostics, never
 * a reason to fail or slow down a request.
 */
@Injectable()
export class RequestLogWriter implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RequestLogWriter.name);
  private buffer: RequestLogEntry[] = [];
  private timer?: NodeJS.Timeout;
  private flushing?: Promise<void>;
  private readonly appIds = new Map<string, string>();
  dropped = 0;

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(REQUEST_LOG_WRITER_OPTIONS)
    private readonly options: RequestLogWriterOptions = writerOptionsFromEnv(),
  ) {}

  onModuleInit(): void {
    if (!this.options.enabled) return;
    this.timer = setInterval(
      () => void this.flush(),
      this.options.flushIntervalMs,
    );
    this.timer.unref?.();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.flush();
  }

  get pending(): number {
    return this.buffer.length;
  }

  record(entry: RequestLogEntry): void {
    if (!this.options.enabled) return;
    if (this.buffer.length >= this.options.maxBuffered) {
      this.dropped += 1;
      if (this.dropped === 1 || this.dropped % 1000 === 0)
        this.logger.warn(
          `Request log buffer full; ${this.dropped} entries dropped`,
        );
      return;
    }
    this.buffer.push(entry);
    if (this.buffer.length >= this.options.batchSize) void this.flush();
  }

  /** Writes everything buffered so far (also used by tests and on shutdown). */
  async flush(): Promise<void> {
    if (this.flushing) {
      await this.flushing;
      if (this.buffer.length === 0) return;
    }
    this.flushing = this.drain().finally(() => (this.flushing = undefined));
    await this.flushing;
  }

  private async drain(): Promise<void> {
    while (this.buffer.length > 0) {
      const batch = this.buffer.splice(0, this.options.batchSize);
      try {
        await this.write(batch);
      } catch (error) {
        this.logger.warn(
          `Dropped ${batch.length} request log entries: ${error instanceof Error ? error.message : "unknown error"}`,
        );
      }
    }
  }

  private async write(batch: RequestLogEntry[]): Promise<void> {
    const store = this.prisma as unknown as Store;
    const unknown = [
      ...new Set(
        batch
          .filter((entry) => !entry.appId && !this.appIds.has(entry.clientId))
          .map((entry) => entry.clientId),
      ),
    ];
    if (unknown.length > 0) {
      const apps = await store.developerApp.findMany({
        where: { clientId: { in: unknown } },
        select: { id: true, clientId: true },
      });
      for (const app of apps) this.appIds.set(app.clientId, app.id);
    }
    const data = batch.flatMap(({ clientId, appId, ...entry }) => {
      const id = appId ?? this.appIds.get(clientId);
      return id ? [{ ...entry, appId: id }] : [];
    });
    if (data.length > 0)
      await store.developerAppRequestLog.createMany({ data });
  }
}
