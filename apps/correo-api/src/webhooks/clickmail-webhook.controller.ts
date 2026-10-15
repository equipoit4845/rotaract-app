import {
  BadRequestException,
  Controller,
  HttpCode,
  Logger,
  Post,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { constructWebhookEvent, type EmailEventData, type WebhookEventPayload } from '@clickmail/sdk/webhook';
import type { Request } from 'express';
import { fromWebhook } from '../inbound/inbound-mail';
import { InboundService } from '../inbound/inbound.service';
import { OutboundService } from '../outbound/outbound.service';
import { Prisma } from '../prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Retries keep the original timestamp and span about two hours. */
const TOLERANCE_SECONDS = 3 * 60 * 60;

/**
 * `POST /correo-api/webhooks/clickmail`: `email.received`, and the delivery
 * events of what we send (`email.sent`, `delivered`, `bounced`, `complained`,
 * `failed`). HMAC over the raw body, de-duplicated by
 * event id; the receipt is written only after the work succeeds, so a failure
 * answers 5xx and ClickMail retries.
 */
@Controller('webhooks/clickmail')
export class ClickMailWebhookController {
  private readonly logger = new Logger(ClickMailWebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inbound: InboundService,
    private readonly outbound: OutboundService,
  ) {}

  @Post()
  @HttpCode(200)
  async receive(@Req() request: RawBodyRequest<Request>) {
    const secret = process.env.CORREO_CLICKMAIL_WEBHOOK_SECRET;
    if (!secret) throw new ServiceUnavailableException('webhook secret not configured');
    let event: WebhookEventPayload;
    try {
      event = constructWebhookEvent({
        payload: request.rawBody ?? Buffer.alloc(0),
        headers: request.headers,
        secret,
        toleranceSeconds: TOLERANCE_SECONDS,
      });
    } catch {
      throw new BadRequestException('invalid signature');
    }

    const seen = await this.prisma.webhookReceipt.findUnique({
      where: { source_eventId: { source: 'CLICKMAIL', eventId: event.id } },
    });
    if (seen) return { received: true, duplicate: true };

    let stored = 0;
    if (event.type === 'email.received') stored = await this.inbound.ingest(fromWebhook(event.data));
    else if (event.type.startsWith('email.'))
      await this.outbound.onDeliveryEvent(event.type, event.data as EmailEventData);

    try {
      await this.prisma.webhookReceipt.create({ data: { source: 'CLICKMAIL', eventId: event.id, type: event.type } });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
    }
    this.logger.log(
      `clickmail event ${event.id} ${event.type}${event.type === 'email.received' ? ` → ${stored}` : ''}`,
    );
    return { received: true };
  }
}
