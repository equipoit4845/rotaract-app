import { Global, Module } from '@nestjs/common';
import { InboundService } from '../inbound/inbound.service';
import { OutboundController } from '../outbound/outbound.controller';
import { OutboundService } from '../outbound/outbound.service';
import { InboxController } from './inbox.controller';
import { MailboxAccessService } from './mailbox-access.service';
import { TrashService } from './trash.service';
import { DraftsController } from '../outbound/drafts.controller';

@Global()
@Module({
  controllers: [InboxController, OutboundController, DraftsController],
  providers: [MailboxAccessService, InboundService, OutboundService, TrashService],
  exports: [MailboxAccessService, InboundService, OutboundService, TrashService],
})
export class InboxModule {}
