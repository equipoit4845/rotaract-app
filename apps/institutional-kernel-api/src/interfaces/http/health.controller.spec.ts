import { ServiceUnavailableException } from "@nestjs/common";

import { HealthService } from "../../infrastructure/health/health.service";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
  it("reports liveness without probing dependencies", () => {
    const controller = new HealthController({
      checkReadiness: jest.fn(),
    } as unknown as HealthService);
    expect(controller.live()).toEqual({ status: "ok" });
  });

  it("reports readiness when every dependency is available", async () => {
    const controller = new HealthController({
      checkReadiness: jest.fn().mockResolvedValue({
        ready: ["postgres", "redis", "nats"],
        failed: [],
      }),
    } as unknown as HealthService);
    await expect(controller.ready()).resolves.toEqual({
      status: "ok",
      dependencies: ["postgres", "redis", "nats"],
    });
  });

  it("returns 503 when a required dependency is unavailable", async () => {
    const controller = new HealthController({
      checkReadiness: jest
        .fn()
        .mockResolvedValue({ ready: ["postgres"], failed: ["redis"] }),
    } as unknown as HealthService);
    await expect(controller.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
