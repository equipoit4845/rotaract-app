import { Controller, Get, Param, Query, Req } from "@nestjs/common";

import type { AuthenticatedRequest } from "../../application/auth/jwt-session.guard";
import { AccessHistoryService } from "../../application/governance/access-history.service";
import { AppCatalogService } from "../../application/governance/app-catalog.service";

/**
 * E11 — what the signed-in person sees about apps. Always keyed by the
 * session's personId: nothing here accepts another person's id.
 */
@Controller("me")
export class MeController {
  constructor(
    private readonly catalog: AppCatalogService,
    private readonly history: AccessHistoryService,
  ) {}

  /** E11.4: the apps the district published for this person. */
  @Get("apps") listMyApps(@Req() request: AuthenticatedRequest) {
    return this.catalog.visibleFor(request.user.personId);
  }

  /** E11.2: apps that reached this person's data (connected or via their club). */
  @Get("app-access") listMyAppAccess(@Req() request: AuthenticatedRequest) {
    return this.history.listForPerson(request.user.personId);
  }

  @Get("app-access/:appId") listMyAppAccessEvents(
    @Req() request: AuthenticatedRequest,
    @Param("appId") appId: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.history.eventsForPerson(request.user.personId, appId, query);
  }
}
