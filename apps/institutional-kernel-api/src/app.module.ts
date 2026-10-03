import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { ThrottlerModule } from "@nestjs/throttler";

import { CacheModule } from "./infrastructure/cache/cache.module";
import { RedisThrottlerStorageService } from "./infrastructure/cache/redis-throttler-storage.service";

import { HealthController } from "./interfaces/http/health.controller";
import { VersionController } from "./interfaces/http/version.controller";
import { HealthService } from "./infrastructure/health/health.service";
import { PrismaService } from "./infrastructure/prisma/prisma.service";
import { AuthService } from "./application/auth/auth.service";
import { OutboxService } from "./application/outbox/outbox.service";
import { AuthController } from "./interfaces/http/auth.controller";
import { OrganizationsController } from "./interfaces/http/organizations.controller";
import { InstitutionalController } from "./interfaces/http/institutional.controller";
import { JwtSessionGuard } from "./application/auth/jwt-session.guard";
import { AuthorizationService } from "./application/authorization/authorization.service";
import { AuthorizationController } from "./interfaces/http/authorization.controller";
import { WorkflowController } from "./interfaces/http/workflow.controller";
import { ServiceApiGuard } from "./application/auth/service-api.guard";
import { ServiceController } from "./interfaces/http/service.controller";
import { CommandExecutorService } from "./application/shared/command-executor.service";
import { AuditService } from "./application/audit/audit.service";
import { OutboxPublisherService } from "./infrastructure/events/outbox-publisher.service";
import { KernelJobsService } from "./application/jobs/kernel-jobs.service";
import { KernelService } from "./application/kernel/kernel.service";
import { HttpCommandContextFactory } from "./interfaces/http/command-context.factory";
import { KernelAccessGuard } from "./interfaces/http/kernel-access.guard";
import { NotificationService } from "./application/notifications/notification.service";
import { OpenApiValidationInterceptor } from "./interfaces/http/openapi-validation.interceptor";
import { OpenApiValidationService } from "./interfaces/http/openapi-validation.service";
import { SigningKeyService } from "./infrastructure/crypto/signing-key.service";
import { WellKnownController } from "./interfaces/http/well-known.controller";
import { DeveloperAppsController } from "./interfaces/http/developer-apps.controller";
import { OAuthController } from "./interfaces/http/oauth.controller";
import { DeveloperAppsService } from "./application/developer-apps/developer-apps.service";
import { ClientCredentialsGrant } from "./application/oauth/client-credentials.grant";
import { ClientAuthenticator } from "./application/oauth/client-authenticator";
import { OidcService } from "./application/oauth/oidc.service";
import { OidcAccessGuard } from "./application/oauth/oidc-access.guard";
import { KernelThrottlerGuard } from "./interfaces/http/kernel-throttler.guard";
import { DataApiService } from "./application/data-api/data-api.service";
import { WebhooksService } from "./application/webhooks/webhooks.service";
import { WebhookDispatcherService } from "./application/webhooks/webhook-dispatcher.service";
import { WebhookStreamService } from "./application/webhooks/webhook-stream.service";
import { WebhooksController } from "./interfaces/http/webhooks.controller";
import { WebhookStreamAliasController } from "./interfaces/http/webhook-stream-alias.controller";
import { EventsController } from "./interfaces/http/events.controller";
// E9 — request logs, trace ids and deprecation headers (docs/16-developer-portal.md)
import { RequestLogWriter } from "./application/request-logs/request-log.writer";
import { RequestLogsService } from "./application/request-logs/request-logs.service";
import { RequestLogsController } from "./interfaces/http/request-logs.controller";
import { RequestLogMiddleware } from "./interfaces/http/request-log.middleware";
import { DeprecationMiddleware } from "./interfaces/http/deprecation.middleware";
// --- E12 — status page (docs/19-operations-e12.md)
import { StatusProbeService } from "./application/status/status-probe.service";
import { StatusService } from "./application/status/status.service";
import { StatusController } from "./interfaces/http/status.controller";
// --- end E12

@Module({
  imports: [
    CacheModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? "development-only-change-me",
    }),
    // §14.1: rate limits are enforced through Redis (RedisThrottlerStorageService)
    // so they hold across replicas instead of resetting per-process.
    ThrottlerModule.forRootAsync({
      inject: [RedisThrottlerStorageService],
      useFactory: (storage: RedisThrottlerStorageService) => ({
        throttlers: [{ ttl: 60_000, limit: 120 }],
        storage,
      }),
    }),
  ],
  controllers: [
    HealthController,
    VersionController,
    AuthController,
    OrganizationsController,
    InstitutionalController,
    AuthorizationController,
    WorkflowController,
    ServiceController,
    WellKnownController,
    DeveloperAppsController,
    OAuthController,
    WebhooksController,
    WebhookStreamAliasController,
    EventsController,
    // E9
    RequestLogsController,
    // --- E12
    StatusController,
    // --- end E12
  ],
  providers: [
    HealthService,
    PrismaService,
    AuthService,
    OutboxService,
    JwtSessionGuard,
    ServiceApiGuard,
    DataApiService,
    AuthorizationService,
    CommandExecutorService,
    AuditService,
    OutboxPublisherService,
    KernelJobsService,
    KernelService,
    HttpCommandContextFactory,
    NotificationService,
    OpenApiValidationService,
    SigningKeyService,
    DeveloperAppsService,
    ClientCredentialsGrant,
    ClientAuthenticator,
    OidcService,
    OidcAccessGuard,
    WebhooksService,
    WebhookDispatcherService,
    WebhookStreamService,
    // E9
    RequestLogWriter,
    RequestLogsService,
    // --- E12
    StatusService,
    StatusProbeService,
    // --- end E12
    { provide: APP_INTERCEPTOR, useClass: OpenApiValidationInterceptor },
    // Order matters: rate limiting runs before authentication, so floods are
    // rejected before any token verification or database work.
    { provide: APP_GUARD, useClass: KernelThrottlerGuard },
    { provide: APP_GUARD, useClass: KernelAccessGuard },
  ],
})
export class AppModule implements NestModule {
  // E9: every request gets a trace id; app requests are logged; deprecated
  // operations carry Deprecation/Sunset headers.
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLogMiddleware, DeprecationMiddleware).forRoutes("*");
  }
}
