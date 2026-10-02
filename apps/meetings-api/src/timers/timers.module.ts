import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MeetingsModule } from '../meetings/meetings.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { TimersController } from './timers.controller';
import { TimersService } from './timers.service';

@Module({
  imports: [MeetingsModule, RealtimeModule, AuditModule],
  controllers: [TimersController],
  providers: [TimersService],
  exports: [TimersService],
})
export class TimersModule {}
