import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";

import { AppCatalogService } from "../../application/governance/app-catalog.service";
import { AppReviewService } from "../../application/governance/app-review.service";
import { HttpCommandContextFactory } from "./command-context.factory";

/**
 * E11 — the district governs the apps (docs/18-data-governance.md): the
 * RDR's review queue and decision (E11.1), per-app quotas (E11.3) and the
 * catalog of apps shown to members (E11.4).
 */
@Controller("developer")
export class AppGovernanceController {
  constructor(
    private readonly reviews: AppReviewService,
    private readonly catalog: AppCatalogService,
    private readonly contexts: HttpCommandContextFactory,
  ) {}

  // --- E11.1 review ------------------------------------------------------

  @Get("app-reviews") listDeveloperAppReviews(
    @Query("organizationId") organizationId: string,
    @Query("status") status?: string,
  ) {
    return this.reviews.queue(organizationId, status);
  }

  @Get("apps/:appId/reviews") listDeveloperAppReviewHistory(
    @Param("appId") appId: string,
  ) {
    return this.reviews.history(appId);
  }

  @Post("apps/:appId/review")
  @HttpCode(200)
  reviewDeveloperApp(
    @Param("appId") appId: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    return this.reviews.decide(
      appId,
      body,
      this.contexts.from(request, "reviewDeveloperApp"),
    );
  }

  @Post("apps/:appId/review-request")
  @HttpCode(200)
  requestDeveloperAppReview(
    @Param("appId") appId: string,
    @Req() request: Request,
  ) {
    return this.reviews.requestReview(
      appId,
      this.contexts.from(request, "requestDeveloperAppReview"),
    );
  }

  // --- E11.3 quotas ------------------------------------------------------

  @Get("apps/:appId/quota") getDeveloperAppQuota(
    @Param("appId") appId: string,
  ) {
    return this.reviews.quota(appId);
  }

  @Put("apps/:appId/quota") updateDeveloperAppQuota(
    @Param("appId") appId: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    return this.reviews.updateQuota(
      appId,
      body,
      this.contexts.from(request, "updateDeveloperAppQuota"),
    );
  }

  // --- E11.4 catalog -----------------------------------------------------

  @Get("app-catalog") listAppCatalog(
    @Query("organizationId") organizationId: string,
  ) {
    return this.catalog.catalog(organizationId);
  }

  @Put("apps/:appId/listing") updateDeveloperAppListing(
    @Param("appId") appId: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    return this.catalog.updateListing(
      appId,
      body,
      this.contexts.from(request, "updateDeveloperAppListing"),
    );
  }
}
