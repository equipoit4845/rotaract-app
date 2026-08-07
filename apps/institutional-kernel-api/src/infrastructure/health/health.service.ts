import { Injectable } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { connect } from "node:net";

type ReadinessResult = { ready: string[]; failed: string[] };

@Injectable()
export class HealthService {
  private readonly prisma = new PrismaClient();

  async checkReadiness(): Promise<ReadinessResult> {
    const checks: Array<readonly [string, Promise<void>]> = [
      ["postgres", this.checkPostgres()],
    ];
    // Redis and NATS are replaceable integrations. A configured dependency is
    // required for readiness; an omitted one is intentionally not probed.
    if (process.env.REDIS_URL)
      checks.push(["redis", this.checkTcp(process.env.REDIS_URL, "redis")]);
    if (process.env.NATS_URL)
      checks.push(["nats", this.checkTcp(process.env.NATS_URL, "nats")]);
    const settled = await Promise.allSettled(checks.map(([, check]) => check));
    const ready: string[] = [];
    const failed: string[] = [];
    settled.forEach((result, index) =>
      (result.status === "fulfilled" ? ready : failed).push(checks[index][0]),
    );
    return { ready, failed };
  }

  private async checkPostgres(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;
  }

  private async checkTcp(
    rawUrl: string | undefined,
    dependency: string,
  ): Promise<void> {
    if (!rawUrl) return;
    const url = new URL(rawUrl);
    const port = Number(url.port || (url.protocol === "redis:" ? 6379 : 4222));
    await new Promise<void>((resolve, reject) => {
      const socket = connect({ host: url.hostname, port });
      socket.setTimeout(1_000);
      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.once("timeout", () => {
        socket.destroy();
        reject(new Error(`${dependency} timed out`));
      });
      socket.once("error", reject);
    });
  }
}
