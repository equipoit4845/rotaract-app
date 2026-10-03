import { Controller, Get, Param, Query } from "@nestjs/common";

import { RequestLogsService } from "../../application/request-logs/request-logs.service";

/**
 * E9.3 — an app's request logs (docs/16-developer-portal.md). Same
 * permission as reading the app (kernel.app.read on the app's
 * organization), resolved by KernelAccessGuard.
 */
@Controller("developer")
export class RequestLogsController {
  constructor(private readonly logs: RequestLogsService) {}

  @Get("apps/:appId/request-logs") listRequestLogs(
    @Param("appId") appId: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.logs.list(appId, query);
  }
}
