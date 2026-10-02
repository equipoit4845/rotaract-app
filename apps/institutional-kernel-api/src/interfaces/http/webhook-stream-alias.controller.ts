import { Controller, Get, Param, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";

import { WebhookStreamService } from "../../application/webhooks/webhook-stream.service";

/**
 * The webhook stream at the path the E6/E7 contract spells
 * (`/developer-apps/{appId}/webhooks/stream`), consumed by `mirotaract
 * webhooks listen`. Same handler as `/developer/apps/{appId}/webhooks/stream`.
 */
@Controller("developer-apps")
export class WebhookStreamAliasController {
  constructor(private readonly stream: WebhookStreamService) {}

  @Get(":appId/webhooks/stream")
  async streamWebhookEventsAlias(
    @Param("appId") appId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    await this.stream.open(appId, request, response);
  }
}
