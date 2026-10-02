import { Module } from '@nestjs/common';
import { MeetingsModule } from '../meetings/meetings.module';
import { HistoryController } from './history.controller';

@Module({
  imports: [MeetingsModule],
  controllers: [HistoryController],
})
export class HistoryModule {}
