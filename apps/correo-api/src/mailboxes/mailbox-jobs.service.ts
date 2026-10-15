import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { InboundService } from '../inbound/inbound.service';
import { TrashService } from '../inbox/trash.service';
import { KernelService } from '../kernel/kernel.service';
import { MailboxesService } from './mailboxes.service';

const HOUR_MS = 60 * 60 * 1000;

/**
 * Background work that does not wait for a webhook:
 *
 * - every hour: end assignments whose period is over, close READ_ONLY
 *   mailboxes past their grace period, push pending changes to ClickMail,
 *   empty what has been in the Papelera for 30 days;
 * - every 6 hours, and 15 s after boot: reconcile with the kernel's current
 *   authorities (covers lost webhooks and creates the mailboxes of whoever
 *   already held a position when the app was first deployed);
 * - every 15 minutes, and after that first reconcile: import from ClickMail
 *   the received mail a lost webhook did not bring.
 *
 * One correo-api runs at a time (recreated, not blue/green); each job also
 * skips a run while the previous one is still going. Off with
 * CORREO_JOBS_ENABLED=false (tests).
 */
@Injectable()
export class MailboxJobsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(MailboxJobsService.name);
  private readonly timers: NodeJS.Timeout[] = [];
  private readonly running = new Set<string>();

  constructor(
    private readonly mailboxes: MailboxesService,
    private readonly kernel: KernelService,
    private readonly inbound: InboundService,
    private readonly trash: TrashService,
  ) {}

  onApplicationBootstrap() {
    if (process.env.CORREO_JOBS_ENABLED === 'false') return;
    if (!this.kernel.configured) {
      this.logger.warn('kernel not configured: mailbox jobs are off');
      return;
    }
    this.timers.push(setTimeout(() => void this.run('reconcile').then(() => this.run('backfill')), 15_000));
    this.timers.push(setInterval(() => void this.run('backfill'), 15 * 60 * 1000));
    this.timers.push(setInterval(() => void this.run('sweep'), HOUR_MS));
    this.timers.push(setInterval(() => void this.run('reconcile'), 6 * HOUR_MS));
  }

  onApplicationShutdown() {
    this.timers.forEach((t) => clearTimeout(t));
  }

  async run(job: 'sweep' | 'reconcile' | 'backfill'): Promise<void> {
    if (this.running.has(job)) return;
    this.running.add(job);
    try {
      if (job === 'backfill') {
        const imported = await this.inbound.backfill();
        if (imported) this.logger.log(`backfill: ${imported} message(s) imported from ClickMail`);
      } else if (job === 'reconcile') {
        const r = await this.mailboxes.reconcile();
        const synced = await this.mailboxes.syncPending();
        this.logger.log(`reconcile: ${r.assigned} assigned, ${r.ended} ended, ${synced} pushed to ClickMail`);
      } else {
        const ended = await this.mailboxes.expirePeriods();
        const closed = await this.mailboxes.closeExpired();
        const synced = await this.mailboxes.syncPending();
        const purged = await this.trash.empty();
        if (purged) this.logger.log(`sweep: ${purged} conversation(s) emptied from the Papelera`);
        if (ended || closed || synced)
          this.logger.log(`sweep: ${ended} ended by period, ${closed} closed, ${synced} pushed to ClickMail`);
      }
    } catch (error) {
      this.logger.warn(`${job} failed: ${error instanceof Error ? `${error.name}: ${error.message}` : 'error'}`);
    } finally {
      this.running.delete(job);
    }
  }
}
