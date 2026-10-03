import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";

import type { AuthenticatedRequest } from "../../application/auth/jwt-session.guard";
import { StatusService } from "../../application/status/status.service";

/**
 * E12.1 — status page API (docs/19-operations-e12.md).
 *
 * GET /status and GET /status/history are public (no auth), cacheable and
 * readable from any origin: they hold no personal data. Incidents and
 * maintenances are managed with kernel.status.manage (the district RDR;
 * SUPERADMIN through the bypass), resolved by KernelAccessGuard.
 */
@Controller()
export class StatusController {
  constructor(private readonly status: StatusService) {}

  @Get("status") async getStatus(
    @Res({ passthrough: true }) response: Response,
  ) {
    publicCache(response, 30);
    return this.status.getStatus();
  }

  @Get("status/history") async getStatusHistory(
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ) {
    const history = await this.status.getHistory(query);
    publicCache(response, 300);
    return history;
  }

  @Get("status/incidents") listStatusIncidents(
    @Query() query: Record<string, unknown>,
  ) {
    return this.status.listIncidents(query);
  }

  @Post("status/incidents") createStatusIncident(
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    return this.status.create(body, personOf(request));
  }

  @Patch("status/incidents/:incidentId") updateStatusIncident(
    @Param("incidentId") incidentId: string,
    @Body() body: unknown,
  ) {
    return this.status.update(incidentId, body);
  }

  @Post("status/incidents/:incidentId/updates") addStatusIncidentUpdate(
    @Param("incidentId") incidentId: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    return this.status.addUpdate(incidentId, body, personOf(request));
  }
}

function personOf(request: Request): string | undefined {
  return (request as unknown as AuthenticatedRequest).user?.personId;
}

function publicCache(response: Response, seconds: number): void {
  response.setHeader(
    "Cache-Control",
    `public, max-age=${seconds}, stale-while-revalidate=${seconds * 2}`,
  );
  // Allowed origins (the Web) already got their own header from the CORS
  // middleware; any other site may read the status without credentials.
  if (!response.getHeader("Access-Control-Allow-Origin"))
    response.setHeader("Access-Control-Allow-Origin", "*");
}
