import { Module } from '@nestjs/common';
import { MailboxJobsService } from './mailbox-jobs.service';
import { MailboxesService } from './mailboxes.service';

@Module({
  providers: [MailboxesService, MailboxJobsService],
  exports: [MailboxesService],
})
export class MailboxesModule {}
