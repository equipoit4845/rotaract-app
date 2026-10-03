import { Controller, Get, HttpCode, Res } from '@nestjs/common';
import type { Response } from 'express';
import { DirectorySyncService } from './directory/directory-sync.service';
import { PrismaService } from './prisma/prisma.service';

/** Unauthenticated liveness/readiness probe: `GET /meetings-api/health`. */
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: DirectorySyncService,
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
    const state = await this.sync.status().catch(() => null);
    if (database !== 'ok') res.status(503);
    return {
      status: database === 'ok' ? 'ok' : 'degraded',
      database,
      directory: {
        lastSuccessAt: state?.lastSuccessAt ?? null,
        lastAttemptAt: state?.lastAttemptAt ?? null,
        lastError: state?.lastError ?? null,
      },
    };
  }
}
