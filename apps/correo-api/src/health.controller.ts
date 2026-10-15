import { Controller, Get, HttpCode, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';
import { KernelService } from './kernel/kernel.service';
import { MAIL_PROVIDER, type MailProvider } from './mail-provider/mail-provider';
import { PrismaService } from './prisma/prisma.service';

/** Unauthenticated liveness/readiness probe: `GET /correo-api/health`. */
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kernel: KernelService,
    @Inject(MAIL_PROVIDER) private readonly mail: MailProvider,
  ) {}

  @Get()
  @HttpCode(200)
  async health(@Res({ passthrough: true }) res: Response) {
    let database = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'down';
    }
    if (database !== 'ok') res.status(503);
    return {
      status: database === 'ok' ? 'ok' : 'degraded',
      database,
      kernel: this.kernel.configured ? 'configured' : 'missing',
      clickmail: this.mail.configured ? 'configured' : 'missing',
    };
  }
}
