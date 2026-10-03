import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MeetingsModule } from '../meetings/meetings.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { SpeakingQueueController } from './speaking-queue.controller';
import { SpeakingQueueService } from './speaking-queue.service';

@Module({
  imports: [MeetingsModule, RealtimeModule, AuditModule],
  controllers: [SpeakingQueueController],
  providers: [SpeakingQueueService],
  exports: [SpeakingQueueService],
})
export class SpeakingQueueModule {}
