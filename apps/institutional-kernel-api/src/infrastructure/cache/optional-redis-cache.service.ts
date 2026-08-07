import { Injectable, Logger } from "@nestjs/common";
import { connect } from "node:net";

/** Minimal Redis adapter. Failures are deliberately swallowed: PostgreSQL remains authoritative. */
@Injectable()
export class OptionalRedisCacheService {
  private readonly logger = new Logger(OptionalRedisCacheService.name);
  async get<T>(key: string): Promise<T | undefined> {
    try {
      const response = await this.command(["GET", key]);
      return response === null ? undefined : (JSON.parse(response) as T);
    } catch (error) {
      this.logger.debug(
        `Redis read skipped: ${error instanceof Error ? error.message : "unknown error"}`,
      );
      return undefined;
    }
  }
  async set(key: string, value: unknown, ttlSeconds = 60): Promise<void> {
    try {
      await this.command([
        "SET",
        key,
        JSON.stringify(value),
        "EX",
        String(ttlSeconds),
      ]);
    } catch (error) {
      this.logger.debug(
        `Redis write skipped: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }
  async del(key: string): Promise<void> {
    try {
      await this.command(["DEL", key]);
    } catch {
      /* cache is optional */
    }
  }
  /** Atomic counter; returns undefined if Redis is unavailable so callers can fail open/closed as they see fit. */
  async incr(key: string): Promise<number | undefined> {
    try {
      const response = await this.command(["INCR", key]);
      return response === null ? undefined : Number(response);
    } catch (error) {
      this.logger.debug(
        `Redis incr skipped: ${error instanceof Error ? error.message : "unknown error"}`,
      );
      return undefined;
    }
  }
  async pexpire(key: string, ttlMilliseconds: number): Promise<void> {
    try {
      await this.command([
        "PEXPIRE",
        key,
        String(Math.max(1, ttlMilliseconds)),
      ]);
    } catch {
      /* cache is optional */
    }
  }
  /** Remaining TTL in milliseconds, or undefined if Redis is unavailable / the key has no expiry / doesn't exist. */
  async pttl(key: string): Promise<number | undefined> {
    try {
      const response = await this.command(["PTTL", key]);
      if (response === null) return undefined;
      const ttl = Number(response);
      return ttl >= 0 ? ttl : undefined;
    } catch (error) {
      this.logger.debug(
        `Redis pttl skipped: ${error instanceof Error ? error.message : "unknown error"}`,
      );
      return undefined;
    }
  }
  private async command(parts: string[]): Promise<string | null> {
    const rawUrl = process.env.REDIS_URL;
    if (!rawUrl) throw new Error("Redis is not configured");
    const url = new URL(rawUrl);
    const request = `*${parts.length}\r\n${parts.map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`).join("")}`;
    return new Promise((resolve, reject) => {
      const socket = connect({
        host: url.hostname,
        port: Number(url.port || 6379),
      });
      let received = "";
      socket.setTimeout(1_000);
      socket.once("connect", () => socket.write(request));
      socket.on("data", (chunk) => {
        received += chunk.toString("utf8");
        if (received.endsWith("\r\n")) socket.end();
      });
      socket.once("timeout", () => {
        socket.destroy();
        reject(new Error("Redis timed out"));
      });
      socket.once("error", reject);
      socket.once("close", () => {
        if (!received)
          return reject(new Error("Redis closed before responding"));
        if (received.startsWith("-"))
          return reject(new Error(received.slice(1).trim()));
        if (received === "$-1\r\n") return resolve(null);
        if (received.startsWith("+")) return resolve(received.slice(1, -2));
        if (received.startsWith(":")) return resolve(received.slice(1, -2));
        const match = received.match(/^\$(\d+)\r\n([\s\S]*)\r\n$/);
        if (match) return resolve(match[2]);
        reject(new Error("Invalid Redis response"));
      });
    });
  }
}
