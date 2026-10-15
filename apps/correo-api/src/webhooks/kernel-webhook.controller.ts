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
import { verifyWebhook, type MiRotaractWebhookEvent } from '@mirotaract/sdk';
import type { Request } from 'express';
import { MailboxesService } from '../mailboxes/mailboxes.service';
import { Prisma } from '../prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * `POST /correo-api/webhooks/mirotaract`: kernel events for the app
 * (`appointment.activated.v1`, `appointment.ended.v1`). Signature checked over
 * the raw body by the SDK (HMAC, 300 s), de-duplicated by event id. The
 * receipt is written only after the work succeeds, so a failure answers 5xx
 * and the kernel retries (72 h).
 */
@Controller('webhooks/mirotaract')
export class KernelWebhookController {
  private readonly logger = new Logger(KernelWebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailboxes: MailboxesService,
  ) {}

  @Post()
  @HttpCode(200)
  async receive(@Req() request: RawBodyRequest<Request>) {
    const secret = process.env.MIROTARACT_WEBHOOK_SECRET;
    if (!secret) throw new ServiceUnavailableException('webhook secret not configured');
    let event: MiRotaractWebhookEvent;
    try {
      event = await verifyWebhook({
        payload: request.rawBody ?? Buffer.alloc(0),
        headers: request.headers as Record<string, string>,
        secret,
      });
    } catch {
      throw new BadRequestException('invalid signature');
    }

    const seen = await this.prisma.webhookReceipt.findUnique({
      where: { source_eventId: { source: 'KERNEL', eventId: event.id } },
    });
    if (seen) return { received: true, duplicate: true };

    switch (event.type) {
      case 'appointment.activated.v1':
        await this.mailboxes.activate(event.data.authority, 'kernel');
        break;
      case 'appointment.ended.v1':
        await this.mailboxes.end(event.data.authority.appointmentId, 'kernel');
        break;
      default:
        // ping.v1 and anything not subscribed: acknowledged, nothing to do.
        break;
    }

    try {
      await this.prisma.webhookReceipt.create({ data: { source: 'KERNEL', eventId: event.id, type: event.type } });
    } catch (error) {
      // Two deliveries of the same event at once: the other one wrote it.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
    }
    this.logger.log(`kernel event ${event.id} ${event.type}`);
    return { received: true };
  }
}
