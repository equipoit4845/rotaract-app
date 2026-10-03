import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../auth/role';
import { resolveRole } from '../auth/role-resolution';
import { DirectorySyncService } from './directory-sync.service';

export type TokenClaims = { name?: string | null; email?: string | null };

export type ResolvedUser = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  isActive: boolean;
};

/**
 * Read side of the kernel directory (DirPerson, DirClub, DirMembership,
 * DirDistrictRole, DistrictStaff, ClubStanding). Everything the legacy code
 * read from User / Club / Membership / ClubPresidency goes through here.
 */
@Injectable()
export class DirectoryService {
  private readonly logger = new Logger(DirectoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: DirectorySyncService,
  ) {}

  /**
   * Makes sure the person exists locally: on-demand kernel sync for an
   * unknown personId, falling back to the (signed) token claims when the
   * kernel is unreachable or the person is outside the app's scope.
   */
  async ensurePerson(personId: string, claims?: TokenClaims): Promise<boolean> {
    const existing = await this.prisma.dirPerson.findUnique({ where: { id: personId } });
    if (existing) {
      if (!existing.email && claims?.email) {
        await this.prisma.dirPerson
          .update({ where: { id: personId }, data: { email: claims.email } })
          .catch(() => undefined);
      }
      return true;
    }
    try {
      if (await this.sync.syncPerson(personId)) return true;
    } catch (err) {
      this.logger.warn(`On-demand sync of person ${personId} failed: ${(err as Error).message}`);
    }
    if (claims?.name || claims?.email) {
      await this.prisma.dirPerson.upsert({
        where: { id: personId },
        create: {
          id: personId,
          fullName: claims.name?.trim() || claims.email || personId,
          email: claims.email ?? null,
          isActive: true,
        },
        update: {},
      });
      return true;
    }
    return false;
  }

  async getRole(personId: string): Promise<Role> {
    const [person, staff, districtRoles, presidency] = await Promise.all([
      this.prisma.dirPerson.findUnique({ where: { id: personId }, select: { platformRole: true } }),
      this.prisma.districtStaff.findUnique({ where: { personId }, select: { role: true } }),
      this.prisma.dirDistrictRole.findMany({ where: { personId }, select: { role: true } }),
      this.prisma.dirMembership.findFirst({
        where: { personId, isPresident: true, active: true },
        select: { id: true },
      }),
    ]);
    return resolveRole({
      platformRole: person?.platformRole ?? null,
      staffRole: staff?.role ?? null,
      districtRoles: districtRoles.map((r) => r.role),
      isPresident: !!presidency,
    });
  }

  async hasDistrictRole(personId: string, role: 'RDR' | 'SECRETARY'): Promise<boolean> {
    const row = await this.prisma.dirDistrictRole.findUnique({
      where: { personId_role: { personId, role } },
    });
    return !!row;
  }

  async resolveUser(personId: string, claims?: TokenClaims): Promise<ResolvedUser | null> {
    await this.ensurePerson(personId, claims);
    const person = await this.prisma.dirPerson.findUnique({ where: { id: personId } });
    if (!person) return null;
    const role = await this.getRole(personId);
    return {
      id: person.id,
      email: person.email ?? claims?.email ?? '',
      fullName: person.fullName,
      role,
      isActive: person.isActive,
    };
  }

  /**
   * Replaces legacy `membership.findFirst({ where: { userId } })`: the
   * person's active club membership, preferring the one where they are
   * president (legacy picked an arbitrary row).
   */
  async getPrimaryMembership(personId: string): Promise<{ clubId: string; isPresident: boolean } | null> {
    const m = await this.prisma.dirMembership.findFirst({
      where: { personId, active: true },
      orderBy: [{ isPresident: 'desc' }, { syncedAt: 'asc' }, { id: 'asc' }],
      select: { clubId: true, isPresident: true },
    });
    return m ?? null;
  }

  async isActiveMember(personId: string, clubId: string): Promise<boolean> {
    const m = await this.prisma.dirMembership.findFirst({
      where: { personId, clubId, active: true },
      select: { id: true },
    });
    return !!m;
  }

  async isPresidentOf(personId: string, clubId: string): Promise<boolean> {
    const m = await this.prisma.dirMembership.findFirst({
      where: { personId, clubId, active: true, isPresident: true },
      select: { id: true },
    });
    return !!m;
  }

  async getPresidentOf(clubId: string): Promise<string | null> {
    const m = await this.prisma.dirMembership.findFirst({
      where: { clubId, active: true, isPresident: true },
      orderBy: { syncedAt: 'asc' },
      select: { personId: true },
    });
    return m?.personId ?? null;
  }

  async getPresidentClubIds(personId: string): Promise<string[]> {
    const rows = await this.prisma.dirMembership.findMany({
      where: { personId, active: true, isPresident: true },
      select: { clubId: true },
    });
    return rows.map((r) => r.clubId);
  }

  /** Legacy: Club.status ACTIVE && enabledForDistrictMeetings (default true). */
  enabledClubsWhere() {
    return {
      status: 'ACTIVE' as const,
      OR: [{ standing: { is: null } }, { standing: { is: { enabledForDistrictMeetings: true } } }],
    };
  }

  async findEnabledClubs(): Promise<{ id: string; name: string }[]> {
    return this.prisma.dirClub.findMany({
      where: this.enabledClubsWhere(),
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Legacy ClubsService.findEnabledForDistrictMeetings: enabled clubs with
   * their presidents' memberships.
   */
  async findEnabledForDistrictMeetings() {
    return this.prisma.dirClub.findMany({
      where: this.enabledClubsWhere(),
      include: {
        memberships: {
          where: { isPresident: true, active: true },
          select: { personId: true },
        },
      },
    });
  }

  /**
   * Legacy ClubStatusService.getQuorumBaseClubs: ACTIVE, constituido, cuota
   * al día, informe al día and enabled for district meetings.
   */
  async getQuorumBaseClubs(): Promise<{ id: string; name: string }[]> {
    return this.prisma.dirClub.findMany({
      where: {
        status: 'ACTIVE',
        standing: {
          is: {
            isConstituido: true,
            cuotaAldia: true,
            informeAlDia: true,
            enabledForDistrictMeetings: true,
          },
        },
      },
      select: { id: true, name: true },
    });
  }
}
