/** Fakes shared by the e2e specs: the kernel directory and ClickMail. */
import type { InboundEmail, InboundEmailSummary } from '@clickmail/sdk';
import type { AuthorityView, PeriodView, PersonView } from '@mirotaract/sdk';
import type { KernelDirectory } from '../src/kernel/kernel.service';
import type { MailProvider, OutgoingMail, OutgoingReply } from '../src/mail-provider/mail-provider';

export const DISTRICT = 'district-4845';

export class FakeKernel implements KernelDirectory {
  readonly districtId = DISTRICT;
  people = new Map<string, PersonView>();
  current: AuthorityView[] = [];
  periodList: PeriodView[] = [
    {
      id: 'per-2026',
      organizationId: DISTRICT,
      code: '2026-2027',
      name: '2026-2027',
      status: 'ACTIVE',
      startDate: '2026-07-01',
      endDate: '2027-06-30',
    } as PeriodView,
  ];
  async person(id: string) {
    const p = this.people.get(id);
    if (!p) throw new Error('unknown person');
    return p;
  }
  async authorities() {
    return this.current;
  }
  async periods() {
    return this.periodList;
  }
}

export class FakeMail implements MailProvider {
  configured = true;
  addresses = new Map<string, { address: string; active: boolean }>();
  senders = new Map<string, { email: string; active: boolean }>();
  failNext = false;
  async ensureAddress(i: { localPart: string; host: string }) {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('clickmail down');
    }
    const address = `${i.localPart}@${i.host}`;
    const hit = [...this.addresses].find(([, a]) => a.address === address);
    if (hit) return hit[0];
    const id = `addr_${this.addresses.size + 1}`;
    this.addresses.set(id, { address, active: true });
    return id;
  }
  async setAddressActive(id: string, active: boolean) {
    this.addresses.get(id)!.active = active;
  }
  async ensureSender(i: { email: string }) {
    const hit = [...this.senders].find(([, s]) => s.email === i.email);
    if (hit) return hit[0];
    const id = `snd_${this.senders.size + 1}`;
    this.senders.set(id, { email: i.email, active: true });
    return id;
  }
  async setSenderActive(id: string, active: boolean) {
    this.senders.get(id)!.active = active;
  }
  inbound: InboundEmail[] = [];
  async listInbound(q: { to: string; dateFrom: Date; page: number }) {
    const items = this.inbound
      .filter((e) => e.toEmails.includes(q.to) && new Date(e.receivedAt) >= q.dateFrom)
      .map((e) => ({ ...e, attachmentsCount: e.attachments.length }) as unknown as InboundEmailSummary);
    return { items: q.page === 1 ? items : [], pages: 1 };
  }
  async getInbound(id: string) {
    const e = this.inbound.find((x) => x.id === id);
    if (!e) throw new Error('not found');
    return e;
  }
  async attachmentUrl(inboundId: string, attachmentId: string) {
    return `https://s3.example.test/${inboundId}/${attachmentId}?signed=1`;
  }
  sent: OutgoingMail[] = [];
  replies: Array<{ inboundId: string; reply: OutgoingReply }> = [];
  /** Thrown by the next send/reply (e.g. { code: 'SENDER_DISABLED' }). */
  nextError: unknown = null;
  private byKey = new Map<string, string>();
  resetSends() {
    this.sent = [];
    this.replies = [];
    this.nextError = null;
    this.byKey.clear();
  }
  private takeError() {
    const e = this.nextError;
    this.nextError = null;
    if (e) throw e;
  }
  private idFor(key: string) {
    const known = this.byKey.get(key);
    if (known) return known;
    const id = `email_${this.byKey.size + 1}`;
    this.byKey.set(key, id);
    return id;
  }
  async send(mail: OutgoingMail) {
    this.takeError();
    this.sent.push(mail);
    return this.idFor(mail.idempotencyKey);
  }
  async reply(inboundId: string, reply: OutgoingReply) {
    this.takeError();
    this.replies.push({ inboundId, reply });
    return this.idFor(reply.idempotencyKey);
  }
  addressActive(address: string) {
    return [...this.addresses.values()].find((a) => a.address === address)?.active;
  }
  senderActive(email: string) {
    return [...this.senders.values()].find((s) => s.email === email)?.active;
  }
}

export const authority = (
  over: Partial<AuthorityView> & { appointmentId: string; personId: string },
): AuthorityView => ({
  appointmentId: over.appointmentId,
  organizationId: over.organizationId ?? DISTRICT,
  periodId: over.periodId ?? 'per-2026',
  positionCode: over.positionCode ?? 'DISTRICT_RDR',
  positionName: 'Representante Distrital (RDR)',
  status: over.status ?? 'ACTIVE',
  startsAt: '2026-07-01T00:00:00.000Z',
  person: { id: over.personId, displayName: 'x' },
});
