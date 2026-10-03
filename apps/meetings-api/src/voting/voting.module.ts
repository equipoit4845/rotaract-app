import { forwardRef, Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MeetingsModule } from '../meetings/meetings.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { VotingController } from './voting.controller';
import { VotingService } from './voting.service';

@Module({
  imports: [forwardRef(() => MeetingsModule), forwardRef(() => RealtimeModule), AuditModule],
  controllers: [VotingController],
  providers: [VotingService],
  exports: [VotingService],
})
export class VotingModule {}
