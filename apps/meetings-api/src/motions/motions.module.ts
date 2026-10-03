import { forwardRef, Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MeetingsModule } from '../meetings/meetings.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { VotingModule } from '../voting/voting.module';
import { MotionsController } from './motions.controller';
import { MotionsService } from './motions.service';

@Module({
  imports: [forwardRef(() => MeetingsModule), AuditModule, VotingModule, forwardRef(() => RealtimeModule)],
  controllers: [MotionsController],
  providers: [MotionsService],
  exports: [MotionsService],
})
export class MotionsModule {}
