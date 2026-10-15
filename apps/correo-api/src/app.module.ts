import { Module } from '@nestjs/common';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health.controller';
import { InboxModule } from './inbox/inbox.module';
import { KernelModule } from './kernel/kernel.module';
import { MailProviderModule } from './mail-provider/mail-provider.module';
import { MailboxesModule } from './mailboxes/mailboxes.module';
import { MeController } from './me/me.controller';
import { PrismaModule } from './prisma/prisma.module';
import { ClickMailWebhookController } from './webhooks/clickmail-webhook.controller';
import { KernelWebhookController } from './webhooks/kernel-webhook.controller';

@Module({
  imports: [PrismaModule, AuditModule, KernelModule, MailProviderModule, AuthModule, InboxModule, MailboxesModule],
  controllers: [HealthController, MeController, KernelWebhookController, ClickMailWebhookController],
})
export class AppModule {}
