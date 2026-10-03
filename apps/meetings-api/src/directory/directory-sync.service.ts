import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AuthorityView,
  KernelClient,
  KernelHttpError,
  MemberView,
  OrganizationView,
  PersonMembershipView,
} from './kernel-client';

const SYNC_STATE_ID = 'kernel';
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;

/** Kernel position codes the meetings module cares about. */
export const POSITION_CLUB_PRESIDENT = 'CLUB_PRESIDENT';
export const POSITION_DISTRICT_RDR = 'DISTRICT_RDR';
export const POSITION_DISTRICT_SECRETARY = 'DISTRICT_SECRETARY';

/** Kernel membership statuses that count as an active membership. */
const ACTIVE_MEMBERSHIP = new Set(['ACTIVE']);

export function mapClubStatus(status: OrganizationView['status']): 'ACTIVE' | 'INACTIVE' {
  return status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE';
}

export function districtRoleFor(positionCode: string): 'RDR' | 'SECRETARY' | null {
  if (positionCode === POSITION_DISTRICT_RDR) return 'RDR';
  if (positionCode === POSITION_DISTRICT_SECRETARY) return 'SECRETARY';
  return null;
}

/**
 * Keeps the local directory (Dir* tables) in sync with the kernel:
 * on boot, every MEETINGS_DIRECTORY_SYNC_INTERVAL_MS (5 min) and on demand
 * for an unknown personId. Any failure leaves the last synced data in place,
 * so the meetings keep working while the kernel is down.
 */
@Injectable()
export class DirectorySyncService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(DirectorySyncService.name);
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;
  private readonly onChange: Array<() => void> = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly kernel: KernelClient,
  ) {}

  /** Lets the realtime gateway drop its enabled-clubs cache after a sync. */
  registerChangeListener(fn: () => void) {
    this.onChange.push(fn);
  }

  notifyChange() {
    for (const fn of this.onChange) {
      try {
        fn();
      } catch {
        /* listeners never break a sync */
      }
    }
  }

  onApplicationBootstrap() {
    if (process.env.MEETINGS_DIRECTORY_SYNC === 'off') {
      this.logger.warn('Directory sync disabled (MEETINGS_DIRECTORY_SYNC=off)');
      return;
    }
    if (!this.kernel.configured) {
      this.logger.warn(
        'KERNEL_API_URL / KERNEL_CLIENT_ID / KERNEL_CLIENT_SECRET not set: serving the directory from the local tables only',
      );
      return;
    }
    // Do not block boot on the kernel.
    void this.syncAll();
    const interval = Number(process.env.MEETINGS_DIRECTORY_SYNC_INTERVAL_MS ?? DEFAULT_INTERVAL_MS);
    this.timer = setInterval(() => void this.syncAll(), interval);
    this.timer.unref?.();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  async status() {
    return this.prisma.dirSyncState.findUnique({ where: { id: SYNC_STATE_ID } });
  }

  /** Full sync; concurrent callers share the running one. */
  syncAll(): Promise<void> {
    if (!this.running) {
      this.running = this.doSyncAll().finally(() => {
        this.running = null;
      });
    }
    return this.running;
  }

  private async doSyncAll(): Promise<void> {
    const startedAt = new Date();
    await this.prisma.dirSyncState.upsert({
      where: { id: SYNC_STATE_ID },
      create: { id: SYNC_STATE_ID, lastAttemptAt: startedAt },
      update: { lastAttemptAt: startedAt },
    });
    try {
      const counts = await this.fetchAndApply(startedAt);
      await this.prisma.dirSyncState.update({
        where: { id: SYNC_STATE_ID },
        data: { lastSuccessAt: new Date(), lastError: null, ...counts },
      });
      this.logger.log(
        `Directory synced: ${counts.clubs} clubs, ${counts.persons} persons, ${counts.memberships} memberships`,
      );
      this.notifyChange();
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      this.logger.error(`Directory sync failed (keeping last synced data): ${message}`);
      await this.prisma.dirSyncState
        .update({ where: { id: SYNC_STATE_ID }, data: { lastError: message.slice(0, 1000) } })
        .catch(() => undefined);
    }
  }

  private async fetchAndApply(syncedAt: Date) {
    // 1. Everything is fetched first; the local tables are only touched once
    //    the whole snapshot is in memory, so a half-failed sync changes nothing.
    const organizations = await this.kernel.listOrganizations();
    const clubs = organizations.filter((o) => o.type === 'CLUB');
    const districts = organizations.filter((o) => o.type === 'DISTRICT');

    const authorities: AuthorityView[] = [];
    if (districts.length > 0) {
      for (const d of districts) authorities.push(...(await this.kernel.listAuthorities(d.id, true)));
    } else {
      for (const c of clubs) authorities.push(...(await this.kernel.listAuthorities(c.id, false)));
    }
    const membersByClub = new Map<string, MemberView[]>();
    for (const club of clubs) membersByClub.set(club.id, await this.kernel.listMembers(club.id));
    const districtMembers: MemberView[] = [];
    for (const d of districts) districtMembers.push(...(await this.kernel.listMembers(d.id)));

    // 2. Derive the read model.
    const presidents = new Set<string>(); // `${clubId}:${personId}`
    const districtRoles = new Map<string, 'RDR' | 'SECRETARY'>(); // `${personId}:${role}`
    const authorityPersons = new Map<string, string>(); // personId -> displayName
    for (const a of authorities) {
      if (a.status !== 'ACTIVE') continue;
      authorityPersons.set(a.person.id, a.person.displayName);
      if (a.positionCode === POSITION_CLUB_PRESIDENT) presidents.add(`${a.organizationId}:${a.person.id}`);
      const role = districtRoleFor(a.positionCode);
      if (role) districtRoles.set(`${a.person.id}:${role}`, role);
    }

    const persons = new Map<string, { fullName: string; email: string | null | undefined }>();
    const addPerson = (m: MemberView) => {
      persons.set(m.personId, {
        fullName: m.person.displayName || `${m.person.firstName} ${m.person.lastName}`.trim(),
        email: m.person.email,
      });
    };
    for (const list of membersByClub.values()) list.forEach(addPerson);
    districtMembers.forEach(addPerson);
    for (const [id, displayName] of authorityPersons) {
      if (!persons.has(id)) persons.set(id, { fullName: displayName, email: undefined });
    }

    // 3. Apply.
    for (const club of clubs) {
      await this.prisma.dirClub.upsert({
        where: { id: club.id },
        create: { id: club.id, name: club.name, code: club.code, status: mapClubStatus(club.status), syncedAt },
        update: { name: club.name, code: club.code, status: mapClubStatus(club.status), syncedAt },
      });
    }
    // Clubs that left the kernel listing (or the app's scope) become INACTIVE;
    // legacy placeholders ("legacy:club:*") are left alone.
    await this.prisma.dirClub.updateMany({
      where: {
        id: { notIn: clubs.map((c) => c.id) },
        NOT: { id: { startsWith: 'legacy:' } },
        status: 'ACTIVE',
      },
      data: { status: 'INACTIVE', syncedAt },
    });
    if (clubs.length > 0) {
      await this.prisma.clubStanding.createMany({
        data: clubs.map((c) => ({ clubId: c.id })),
        skipDuplicates: true,
      });
    }

    const personEntries = [...persons.entries()];
    for (let i = 0; i < personEntries.length; i += 200) {
      const chunk = personEntries.slice(i, i + 200);
      await this.prisma.$transaction(
        chunk.map(([id, p]) =>
          this.prisma.dirPerson.upsert({
            where: { id },
            create: { id, fullName: p.fullName, email: p.email ?? null, isActive: true, syncedAt },
            update: {
              fullName: p.fullName,
              // email is only present with the contact scope; never erase a known one
              ...(p.email ? { email: p.email } : {}),
              isActive: true,
              syncedAt,
            },
          }),
        ),
      );
    }

    let membershipCount = 0;
    for (const [clubId, members] of membersByClub) {
      const seen = new Set<string>();
      const ops = members.map((m) => {
        seen.add(m.personId);
        const active = ACTIVE_MEMBERSHIP.has(m.status);
        const isPresident = active && presidents.has(`${clubId}:${m.personId}`);
        return this.prisma.dirMembership.upsert({
          where: { personId_clubId: { personId: m.personId, clubId } },
          create: { personId: m.personId, clubId, active, isPresident, syncedAt },
          update: { active, isPresident, syncedAt },
        });
      });
      for (let i = 0; i < ops.length; i += 200) await this.prisma.$transaction(ops.slice(i, i + 200));
      membershipCount += members.length;
      // Memberships that disappeared from the kernel listing are deactivated, never deleted.
      await this.prisma.dirMembership.updateMany({
        where: { clubId, personId: { notIn: [...seen] } },
        data: { active: false, isPresident: false, syncedAt },
      });
    }

    await this.prisma.$transaction([
      this.prisma.dirDistrictRole.deleteMany({}),
      this.prisma.dirDistrictRole.createMany({
        data: [...districtRoles.entries()].map(([key, role]) => ({
          personId: key.slice(0, key.lastIndexOf(':')),
          role,
          syncedAt,
        })),
        skipDuplicates: true,
      }),
    ]);

    return { clubs: clubs.length, persons: persons.size, memberships: membershipCount };
  }

  /**
   * On-demand sync of one person unknown to the local directory. Returns
   * false when the kernel does not know them or they are out of the app's
   * scope (403/404); throws when the kernel is unreachable.
   */
  async syncPerson(personId: string): Promise<boolean> {
    if (!this.kernel.configured) return false;
    let person;
    try {
      person = await this.kernel.getPerson(personId);
    } catch (err) {
      if (err instanceof KernelHttpError && (err.status === 403 || err.status === 404)) return false;
      throw err;
    }
    const syncedAt = new Date();
    await this.prisma.dirPerson.upsert({
      where: { id: personId },
      create: {
        id: personId,
        fullName: person.displayName || `${person.firstName} ${person.lastName}`.trim(),
        email: person.email ?? null,
        isActive: true,
        syncedAt,
      },
      update: {
        fullName: person.displayName || `${person.firstName} ${person.lastName}`.trim(),
        ...(person.email ? { email: person.email } : {}),
        syncedAt,
      },
    });

    const memberships = await this.kernel.personMemberships(personId).catch((): PersonMembershipView[] => []);
    for (const m of memberships) {
      if (m.organizationType === 'DISTRICT' && ACTIVE_MEMBERSHIP.has(m.status)) {
        const auth = await this.kernel.listAuthorities(m.organizationId, false).catch((): AuthorityView[] => []);
        for (const a of auth) {
          const role = a.status === 'ACTIVE' && a.person.id === personId ? districtRoleFor(a.positionCode) : null;
          if (role) {
            await this.prisma.dirDistrictRole.upsert({
              where: { personId_role: { personId, role } },
              create: { personId, role, syncedAt },
              update: { syncedAt },
            });
          }
        }
        continue;
      }
      if (m.organizationType !== 'CLUB') continue;
      const club = await this.prisma.dirClub.findUnique({ where: { id: m.organizationId } });
      if (!club) {
        await this.prisma.dirClub.create({
          data: { id: m.organizationId, name: m.organizationName, code: m.organizationId, syncedAt },
        });
        await this.prisma.clubStanding.createMany({ data: [{ clubId: m.organizationId }], skipDuplicates: true });
      }
      let isPresident = false;
      const active = ACTIVE_MEMBERSHIP.has(m.status);
      if (active) {
        const auth = await this.kernel.listAuthorities(m.organizationId, false).catch((): AuthorityView[] => []);
        isPresident = auth.some(
          (a) => a.status === 'ACTIVE' && a.positionCode === POSITION_CLUB_PRESIDENT && a.person.id === personId,
        );
      }
      await this.prisma.dirMembership.upsert({
        where: { personId_clubId: { personId, clubId: m.organizationId } },
        create: { personId, clubId: m.organizationId, active, isPresident, syncedAt },
        update: { active, isPresident, syncedAt },
      });
    }
    return true;
  }
}
