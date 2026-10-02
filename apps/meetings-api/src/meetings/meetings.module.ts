import { forwardRef, Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AttachmentsModule } from '../attachments/attachments.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { MeetingsController } from './meetings.controller';
import { MeetingsService } from './meetings.service';
import { QuorumService } from './quorum.service';
import { ActaService } from './acta.service';
import { ActaController } from './acta.controller';
import { AIService } from './ai.service';

@Module({
  imports: [AuditModule, AttachmentsModule, forwardRef(() => RealtimeModule)],
  controllers: [MeetingsController, ActaController],
  providers: [MeetingsService, QuorumService, ActaService, AIService],
  exports: [MeetingsService, QuorumService, ActaService, AIService],
})
export class MeetingsModule {}
