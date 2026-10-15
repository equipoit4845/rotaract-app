import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { MailboxAccessService } from '../inbox/mailbox-access.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * `GET /correo-api/me`: who is signed in, what the kernel lets them do, and
 * the mailboxes they can open. Without `correo.mailbox.use` the list is empty
 * whatever the database says.
 */
@Controller('me')
@UseGuards(AuthGuard('jwt'))
export class MeController {
  constructor(
    private readonly mailboxes: MailboxAccessService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async me(@CurrentUser() user: CurrentUserPayload) {
    const { canUse, canManage, mailboxes } = await this.mailboxes.openable(user.personId);
    const unread = mailboxes.length
      ? await this.prisma.thread.groupBy({
          by: ['mailboxId'],
          where: { mailboxId: { in: mailboxes.map((m) => m.id) }, folder: 'INBOX', unreadCount: { gt: 0 } },
          _count: { _all: true },
        })
      : [];
    const unreadOf = new Map(unread.map((u) => [u.mailboxId, u._count._all]));
    return {
      personId: user.personId,
      name: user.name,
      canUse,
      canManage,
      mailboxes: mailboxes.map((mailbox) => ({
        id: mailbox.id,
        kind: mailbox.kind,
        address: mailbox.address,
        displayName: mailbox.displayName,
        positionCode: mailbox.positionCode,
        status: mailbox.status,
        closesAt: mailbox.closesAt,
        // false until ClickMail reflects the status (no key yet, or a retry pending).
        ready: mailbox.clickmailSyncedStatus === mailbox.status,
        /** Unread conversations in Recibidos. */
        unread: unreadOf.get(mailbox.id) ?? 0,
      })),
    };
  }
}
