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
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";

import { WebhookStreamService } from "../../application/webhooks/webhook-stream.service";
import { WebhooksService } from "../../application/webhooks/webhooks.service";
import { HttpCommandContextFactory } from "./command-context.factory";

/**
 * E7 — an app's webhook endpoints (docs/13-events-and-webhooks.md). Same
 * permissions as managing the app itself (kernel.app.read / .manage on the
 * app's organization), resolved by KernelAccessGuard.
 */
@Controller("developer")
export class WebhooksController {
  constructor(
    private readonly webhooks: WebhooksService,
    private readonly stream: WebhookStreamService,
    private readonly contexts: HttpCommandContextFactory,
  ) {}

  // Declared before `apps/:appId/webhooks/:endpointId` so "stream" is never
  // taken for an endpoint id.
  @Get("apps/:appId/webhooks/stream")
  async streamWebhookEvents(
    @Param("appId") appId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    await this.stream.open(appId, request, response);
  }

  @Get("apps/:appId/webhooks") listWebhookEndpoints(
    @Param("appId") appId: string,
  ) {
    return this.webhooks.list(appId);
  }

  @Post("apps/:appId/webhooks") createWebhookEndpoint(
    @Param("appId") appId: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    return this.webhooks.create(
      appId,
      body,
      this.contexts.from(request, "createWebhookEndpoint"),
    );
  }

  @Get("apps/:appId/webhooks/:endpointId") getWebhookEndpoint(
    @Param("appId") appId: string,
    @Param("endpointId") endpointId: string,
  ) {
    return this.webhooks.get(appId, endpointId);
  }

  @Patch("apps/:appId/webhooks/:endpointId") updateWebhookEndpoint(
    @Param("appId") appId: string,
    @Param("endpointId") endpointId: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    return this.webhooks.update(
      appId,
      endpointId,
      body,
      this.contexts.from(request, "updateWebhookEndpoint"),
    );
  }

  @Delete("apps/:appId/webhooks/:endpointId")
  @HttpCode(204)
  async deleteWebhookEndpoint(
    @Param("appId") appId: string,
    @Param("endpointId") endpointId: string,
    @Req() request: Request,
  ): Promise<void> {
    await this.webhooks.remove(
      appId,
      endpointId,
      this.contexts.from(request, "deleteWebhookEndpoint"),
    );
  }

  @Post("apps/:appId/webhooks/:endpointId/rotate-secret")
  rotateWebhookSecret(
    @Param("appId") appId: string,
    @Param("endpointId") endpointId: string,
    @Req() request: Request,
  ) {
    return this.webhooks.rotateSecret(
      appId,
      endpointId,
      this.contexts.from(request, "rotateWebhookSecret"),
    );
  }

  @Post("apps/:appId/webhooks/:endpointId/test")
  @HttpCode(202)
  sendWebhookTest(
    @Param("appId") appId: string,
    @Param("endpointId") endpointId: string,
    @Req() request: Request,
  ) {
    return this.webhooks.sendTest(
      appId,
      endpointId,
      this.contexts.from(request, "sendWebhookTest"),
    );
  }

  @Get("apps/:appId/webhooks/:endpointId/deliveries") listWebhookDeliveries(
    @Param("appId") appId: string,
    @Param("endpointId") endpointId: string,
    @Query() query: { status?: string; cursor?: string; limit?: string },
  ) {
    return this.webhooks.listDeliveries(appId, endpointId, query);
  }

  @Post("apps/:appId/webhooks/:endpointId/deliveries/:deliveryId/redeliver")
  @HttpCode(202)
  redeliverWebhook(
    @Param("appId") appId: string,
    @Param("endpointId") endpointId: string,
    @Param("deliveryId") deliveryId: string,
    @Req() request: Request,
  ) {
    return this.webhooks.redeliver(
      appId,
      endpointId,
      deliveryId,
      this.contexts.from(request, "redeliverWebhook"),
    );
  }
}
