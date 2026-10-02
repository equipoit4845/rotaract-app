import { Module } from '@nestjs/common';
import { AttachmentsModule } from './attachments/attachments.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CartaPoderModule } from './carta-poder/carta-poder.module';
import { BulkModule } from './common/bulk/bulk.module';
import { DirectoryModule } from './directory/directory.module';
import { HealthController } from './health.controller';
import { HistoryModule } from './history/history.module';
import { MeetingsModule } from './meetings/meetings.module';
import { MotionsModule } from './motions/motions.module';
import { PrismaModule } from './prisma/prisma.module';
import { RealtimeModule } from './realtime/realtime.module';
import { SpeakingQueueModule } from './speaking-queue/speaking-queue.module';
import { TimersModule } from './timers/timers.module';
import { TopicsModule } from './topics/topics.module';
import { VotingModule } from './voting/voting.module';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    BulkModule,
    DirectoryModule,
    AuthModule,
    AttachmentsModule,
    RealtimeModule,
    MeetingsModule,
    TopicsModule,
    VotingModule,
    MotionsModule,
    SpeakingQueueModule,
    TimersModule,
    CartaPoderModule,
    HistoryModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
