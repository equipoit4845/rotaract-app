import { forwardRef, Module } from '@nestjs/common';
import { VotingModule } from '../voting/voting.module';
import { MeetingsModule } from '../meetings/meetings.module';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [forwardRef(() => VotingModule), forwardRef(() => MeetingsModule)],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
