import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";

import { HealthService } from "../../infrastructure/health/health.service";

@Controller("/health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get("/live")
  live(): { status: "ok" } {
    return { status: "ok" };
  }

  @Get("/ready")
  async ready(): Promise<{ status: "ok"; dependencies: string[] }> {
    const result = await this.healthService.checkReadiness();
    if (result.failed.length) {
      throw new ServiceUnavailableException({
        status: "unavailable",
        failed: result.failed,
      });
    }
    return { status: "ok", dependencies: result.ready };
  }
}
