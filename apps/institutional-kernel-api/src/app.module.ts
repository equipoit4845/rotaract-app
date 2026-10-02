import { Module } from "@nestjs/common";
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
  ],
  providers: [
    HealthService,
    PrismaService,
    AuthService,
    OutboxService,
    JwtSessionGuard,
    ServiceApiGuard,
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
    { provide: APP_INTERCEPTOR, useClass: OpenApiValidationInterceptor },
    { provide: APP_GUARD, useClass: KernelAccessGuard },
  ],
})
export class AppModule {}
