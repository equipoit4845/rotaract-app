import { BadRequestException } from "@nestjs/common";

import type { PrismaService } from "../../infrastructure/prisma/prisma.service";
import {
  RequestLogsService,
  parseRequestLogFilters,
  requestLogWhere,
} from "./request-logs.service";

describe("request log filters (E9.3)", () => {
  it("parses status classes, 'error' and exact codes", () => {
    expect(parseRequestLogFilters({ status: "4xx" }).status).toEqual({
      gte: 400,
      lt: 500,
    });
    expect(parseRequestLogFilters({ status: "5XX" }).status).toEqual({
      gte: 500,
      lt: 600,
    });
    expect(parseRequestLogFilters({ status: "error" }).status).toEqual({
      gte: 400,
      lt: 600,
    });
    expect(parseRequestLogFilters({ status: "404" }).status).toEqual({
      equals: 404,
    });
  });

  it("rejects invalid filters with 400", () => {
    for (const query of [
      { status: "teapot" },
      { from: "yesterday" },
      { from: "2026-10-04T00:00:00Z", to: "2026-10-03T00:00:00Z" },
      { limit: "0" },
      { limit: "101" },
      { traceId: "x".repeat(200) },
    ])
      expect(() => parseRequestLogFilters(query)).toThrow(BadRequestException);
  });

  it("builds a where clause always confined to the app", () => {
    const filters = parseRequestLogFilters({
      status: "4xx",
      code: "KERNEL_HTTP_403",
      traceId: "abc",
      from: "2026-10-01T00:00:00Z",
      to: "2026-10-02T00:00:00Z",
      limit: "10",
    });
    expect(filters.limit).toBe(10);
    expect(requestLogWhere("app_1", filters)).toEqual({
      appId: "app_1",
      status: { gte: 400, lt: 500 },
      problemCode: "KERNEL_HTTP_403",
      traceId: "abc",
      createdAt: {
        gte: new Date("2026-10-01T00:00:00Z"),
        lt: new Date("2026-10-02T00:00:00Z"),
      },
    });
    expect(requestLogWhere("app_1", parseRequestLogFilters({}))).toEqual({
      appId: "app_1",
    });
  });

  it("pages newest first and maps rows to the contract shape", async () => {
    const row = (id: string) => ({
      id,
      appId: "app_1",
      method: "GET",
      route: "/service/organizations/{organizationId}",
      status: 403,
      problemCode: "KERNEL_HTTP_403",
      problemType: "https://api.rotaract4845.com/errors/kernel_http_403",
      latencyMs: 4,
      traceId: "t",
      clientIp: "10.0.0.0",
      createdAt: new Date(),
    });
    const prisma = {
      developerApp: { findUnique: jest.fn(async () => ({ id: "app_1" })) },
      developerAppRequestLog: {
        findFirst: jest.fn(),
        findMany: jest.fn(async () => [row("c"), row("b"), row("a")]),
      },
    };
    const service = new RequestLogsService(prisma as unknown as PrismaService);
    const page = await service.list("app_1", { limit: "2" });
    expect(prisma.developerAppRequestLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { appId: "app_1" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 3,
      }),
    );
    expect(page.items.map((item) => item.id)).toEqual(["c", "b"]);
    expect(page.items[0]).toMatchObject({
      code: "KERNEL_HTTP_403",
      type: "https://api.rotaract4845.com/errors/kernel_http_403",
    });
    expect(page.pageInfo).toEqual({ hasMore: true, nextCursor: "b" });
  });

  it("purges rows older than 30 days", async () => {
    const prisma = {
      developerAppRequestLog: {
        deleteMany: jest.fn(async () => ({ count: 7 })),
      },
    };
    const service = new RequestLogsService(prisma as unknown as PrismaService);
    const now = new Date("2026-11-03T00:00:00Z");
    await expect(service.purgeExpired(now)).resolves.toBe(7);
    expect(prisma.developerAppRequestLog.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: new Date("2026-10-04T00:00:00Z") } },
    });
  });
});
