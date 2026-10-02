import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MeetingsModule } from '../meetings/meetings.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { BulkModule } from '../common/bulk/bulk.module';
import { TopicsController } from './topics.controller';
import { TopicsService } from './topics.service';

@Module({
  imports: [MeetingsModule, RealtimeModule, AuditModule, BulkModule],
  controllers: [TopicsController],
  providers: [TopicsService],
  exports: [TopicsService],
})
export class TopicsModule {}
