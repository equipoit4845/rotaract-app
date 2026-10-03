import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
  Optional,
} from "@nestjs/common";

import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import {
  COALESCED_KINDS,
  historyOptionsFromEnv,
  type AccessEvent,
  type AccessKind,
} from "./access-history";

export const ACCESS_HISTORY_OPTIONS = "ACCESS_HISTORY_OPTIONS";
type Options = ReturnType<typeof historyOptionsFromEnv>;

/**
 * E11.2 — buffers access-history rows and writes them in batches off the
 * request path (like the E9 RequestLogWriter): `record()` never awaits the
 * database and never throws. Bounded buffer; a failed batch is dropped with
 * a warning. Repeated reads/refreshes of the same person + app + data within
 * the coalescing window are written once.
 */
@Injectable()
export class AccessHistoryWriter
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(AccessHistoryWriter.name);
  private buffer: AccessEvent[] = [];
  private timer?: NodeJS.Timeout;
  private flushing?: Promise<void>;
  private readonly appIds = new Map<string, string>();
  private readonly lastSeen = new Map<string, number>();
  dropped = 0;
  readonly options: Options;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(ACCESS_HISTORY_OPTIONS) options?: Options,
  ) {
    this.options = options ?? historyOptionsFromEnv();
  }

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

  record(event: {
    personId: string;
    appId?: string;
    clientId?: string;
    kind: AccessKind;
    details?: string[];
    at?: Date;
  }): void {
    if (!this.options.enabled || !event.personId) return;
    if (!event.appId && !event.clientId) return;
    const details = [...new Set(event.details ?? [])].sort();
    const createdAt = event.at ?? new Date();
    if (COALESCED_KINDS.has(event.kind)) {
      const key = `${event.personId}|${event.appId ?? event.clientId}|${event.kind}|${details.join(",")}`;
      const last = this.lastSeen.get(key);
      if (
        last !== undefined &&
        createdAt.getTime() - last < this.options.coalesceMs
      )
        return;
      if (this.lastSeen.size >= 50_000) this.lastSeen.clear();
      this.lastSeen.set(key, createdAt.getTime());
    }
    if (this.buffer.length >= this.options.maxBuffered) {
      this.dropped += 1;
      if (this.dropped === 1 || this.dropped % 1000 === 0)
        this.logger.warn(
          `Access history buffer full; ${this.dropped} entries dropped`,
        );
      return;
    }
    this.buffer.push({
      personId: event.personId,
      appId: event.appId,
      clientId: event.clientId,
      kind: event.kind,
      details,
      createdAt,
    });
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
          `Dropped ${batch.length} access history entries: ${error instanceof Error ? error.message : "unknown error"}`,
        );
      }
    }
  }

  private async write(batch: AccessEvent[]): Promise<void> {
    const unknown = [
      ...new Set(
        batch
          .filter(
            (event) =>
              !event.appId &&
              event.clientId &&
              !this.appIds.has(event.clientId),
          )
          .map((event) => event.clientId as string),
      ),
    ];
    if (unknown.length > 0) {
      const apps = await this.prisma.developerApp.findMany({
        where: { clientId: { in: unknown } },
        select: { id: true, clientId: true },
      });
      for (const app of apps) this.appIds.set(app.clientId, app.id);
    }
    const data = batch.flatMap((event) => {
      const appId =
        event.appId ?? (event.clientId && this.appIds.get(event.clientId));
      return appId
        ? [
            {
              personId: event.personId,
              appId,
              kind: event.kind,
              details: event.details,
              createdAt: event.createdAt,
            },
          ]
        : [];
    });
    if (data.length > 0) await this.prisma.personAppAccess.createMany({ data });
  }
}
