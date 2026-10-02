import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";

import { DeveloperAppsService } from "../../application/developer-apps/developer-apps.service";
import { HttpCommandContextFactory } from "./command-context.factory";

/** E2 — the district's console for the apps committees build. */
@Controller("developer")
export class DeveloperAppsController {
  constructor(
    private readonly apps: DeveloperAppsService,
    private readonly contexts: HttpCommandContextFactory,
  ) {}

  @Get("apps") listDeveloperApps(
    @Query("organizationId") organizationId: string,
  ) {
    return this.apps.list(organizationId);
  }

  @Post("apps") createDeveloperApp(
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    return this.apps.create(
      body,
      this.contexts.from(request, "createDeveloperApp"),
    );
  }

  @Get("apps/:appId") getDeveloperApp(@Param("appId") appId: string) {
    return this.apps.get(appId);
  }

  @Patch("apps/:appId") updateDeveloperApp(
    @Param("appId") appId: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    return this.apps.update(
      appId,
      body,
      this.contexts.from(request, "updateDeveloperApp"),
    );
  }

  @Post("apps/:appId/secrets") rotateDeveloperAppSecret(
    @Param("appId") appId: string,
    @Req() request: Request,
  ) {
    return this.apps.rotateSecret(
      appId,
      this.contexts.from(request, "rotateDeveloperAppSecret"),
    );
  }

  @Delete("apps/:appId/secrets/:secretId")
  @HttpCode(204)
  async revokeDeveloperAppSecret(
    @Param("appId") appId: string,
    @Param("secretId") secretId: string,
    @Req() request: Request,
  ) {
    await this.apps.revokeSecret(
      appId,
      secretId,
      this.contexts.from(request, "revokeDeveloperAppSecret"),
    );
  }

  @Post("apps/:appId/suspend") suspendDeveloperApp(
    @Param("appId") appId: string,
    @Req() request: Request,
  ) {
    return this.apps.transition(
      appId,
      "SUSPENDED",
      this.contexts.from(request, "suspendDeveloperApp"),
    );
  }

  @Post("apps/:appId/activate") activateDeveloperApp(
    @Param("appId") appId: string,
    @Req() request: Request,
  ) {
    return this.apps.transition(
      appId,
      "ACTIVE",
      this.contexts.from(request, "activateDeveloperApp"),
    );
  }

  @Post("apps/:appId/revoke") revokeDeveloperApp(
    @Param("appId") appId: string,
    @Req() request: Request,
  ) {
    return this.apps.transition(
      appId,
      "REVOKED",
      this.contexts.from(request, "revokeDeveloperApp"),
    );
  }
}
