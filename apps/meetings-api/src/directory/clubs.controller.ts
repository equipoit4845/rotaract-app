import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { Role } from '../auth/role';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { DirectorySyncService } from './directory-sync.service';

type ClubRow = {
  id: string;
  name: string;
  code: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: Date;
  updatedAt: Date;
  standing: {
    isConstituido: boolean;
    cuotaAldia: boolean;
    informeAlDia: boolean;
    enabledForDistrictMeetings: boolean;
    updatedAt: Date;
  } | null;
};

/** Legacy `Club` shape (legacy defaults when the club has no standing row). */
export function toLegacyClub(c: ClubRow) {
  return {
    id: c.id,
    name: c.name,
    code: c.code,
    status: c.status,
    presidentEmail: null,
    isConstituido: c.standing?.isConstituido ?? true,
    enabledForDistrictMeetings: c.standing?.enabledForDistrictMeetings ?? true,
    cuotaAldia: c.standing?.cuotaAldia ?? false,
    informeAlDia: c.standing?.informeAlDia ?? false,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

type StandingPatch = {
  clubId?: string;
  isConstituido?: boolean;
  cuotaAldia?: boolean;
  informeAlDia?: boolean;
  enabledForDistrictMeetings?: boolean;
};

const STANDING_FLAGS = ['isConstituido', 'cuotaAldia', 'informeAlDia', 'enabledForDistrictMeetings'] as const;

/**
 * Club lookups used by the meetings screens (legacy `GET /clubs`,
 * `GET /clubs/:id`, `GET /district/clubs[/:id]`) and the "Habilitación de
 * clubes" admin screen (`GET/PATCH /clubs/standing`).
 */
@Controller()
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class ClubsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sync: DirectorySyncService,
  ) {}

  @Get('clubs')
  @Roles(Role.SECRETARY, Role.PRESIDENT, Role.RDR, Role.PARTICIPANT)
  async list(@Query('includeInactive') includeInactive?: string) {
    const clubs = await this.prisma.dirClub.findMany({
      where: includeInactive === 'true' ? undefined : { status: 'ACTIVE' },
      include: { standing: true },
      orderBy: { name: 'asc' },
    });
    return clubs.map(toLegacyClub);
  }

  /** Habilitación de clubes: every club with its standing and quorum-base flag. */
  @Get('clubs/standing')
  @Roles(Role.SECRETARY, Role.RDR)
  async listStanding() {
    const clubs = await this.prisma.dirClub.findMany({
      include: { standing: true },
      orderBy: { name: 'asc' },
    });
    return clubs.map((c) => {
      const club = toLegacyClub(c);
      return {
        clubId: c.id,
        name: c.name,
        code: c.code,
        status: c.status,
        isConstituido: club.isConstituido,
        cuotaAldia: club.cuotaAldia,
        informeAlDia: club.informeAlDia,
        enabledForDistrictMeetings: club.enabledForDistrictMeetings,
        /** Counts for the quorum base (Art. 41). */
        inQuorumBase:
          c.status === 'ACTIVE' &&
          club.isConstituido &&
          club.cuotaAldia &&
          club.informeAlDia &&
          club.enabledForDistrictMeetings,
        updatedAt: c.standing?.updatedAt ?? null,
      };
    });
  }

  /**
   * Body: one `{ clubId, ...flags }`, an array of them, or `{ updates: [...] }`.
   * Returns the updated rows.
   */
  @Patch('clubs/standing')
  @Roles(Role.SECRETARY, Role.RDR)
  async patchStanding(
    @Body() body: StandingPatch | StandingPatch[] | { updates: StandingPatch[] },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const updates: StandingPatch[] = Array.isArray(body)
      ? body
      : Array.isArray((body as { updates?: unknown })?.updates)
        ? (body as { updates: StandingPatch[] }).updates
        : [body as StandingPatch];
    if (updates.length === 0) throw new BadRequestException('Sin cambios');
    const results = [];
    for (const u of updates) results.push(await this.applyStanding(u.clubId, u, user.id));
    return Array.isArray(body) || 'updates' in (body as object) ? results : results[0];
  }

  @Patch('clubs/:clubId/standing')
  @Roles(Role.SECRETARY, Role.RDR)
  patchOneStanding(
    @Param('clubId') clubId: string,
    @Body() body: StandingPatch,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.applyStanding(clubId, body, user.id);
  }

  private async applyStanding(clubId: string | undefined, patch: StandingPatch, actorUserId: string) {
    if (!clubId || typeof clubId !== 'string') throw new BadRequestException('clubId requerido');
    const data: Record<string, boolean> = {};
    for (const flag of STANDING_FLAGS) {
      const v = patch[flag];
      if (v === undefined) continue;
      if (typeof v !== 'boolean') throw new BadRequestException(`${flag} debe ser booleano`);
      data[flag] = v;
    }
    const club = await this.prisma.dirClub.findUnique({ where: { id: clubId } });
    if (!club) throw new NotFoundException('Club no encontrado');
    const standing = await this.prisma.clubStanding.upsert({
      where: { clubId },
      create: { clubId, ...data, updatedById: actorUserId },
      update: { ...data, updatedById: actorUserId },
    });
    await this.audit.log({
      clubId,
      actorUserId,
      action: 'club.standing.updated',
      entityType: 'ClubStanding',
      entityId: clubId,
      metadata: data,
    });
    this.sync.notifyChange();
    return { ...standing, name: club.name, code: club.code, status: club.status };
  }

  @Get('clubs/:id')
  @Roles(Role.SECRETARY, Role.PRESIDENT, Role.RDR, Role.PARTICIPANT)
  async get(@Param('id') id: string) {
    return this.clubWithAuthorities(id);
  }

  /** Legacy `GET /district/clubs` (DistrictGuard: district roles). */
  @Get('district/clubs')
  @Roles(Role.SECRETARY, Role.RDR)
  async districtList(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('informeAlDia') informeAlDia?: string,
    @Query('enabledForDistrictMeetings') enabled?: string,
  ) {
    const clubs = await this.prisma.dirClub.findMany({
      where: {
        ...(status === 'ACTIVE' || status === 'INACTIVE' ? { status } : {}),
        ...(search?.trim()
          ? {
              OR: [
                { name: { contains: search.trim(), mode: 'insensitive' as const } },
                { code: { contains: search.trim(), mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      include: { standing: true },
      orderBy: { name: 'asc' },
    });
    return clubs
      .map(toLegacyClub)
      .filter((c) => informeAlDia === undefined || c.informeAlDia === (informeAlDia === 'true'))
      .filter((c) => enabled === undefined || c.enabledForDistrictMeetings === (enabled === 'true'));
  }

  /** Legacy `GET /district/clubs/:id`: club + `authorities` (active members, presidents first). */
  @Get('district/clubs/:id')
  @Roles(Role.SECRETARY, Role.RDR)
  async districtGet(@Param('id') id: string) {
    return this.clubWithAuthorities(id);
  }

  private async clubWithAuthorities(id: string) {
    const club = await this.prisma.dirClub.findUnique({ where: { id }, include: { standing: true } });
    if (!club) throw new NotFoundException('Club no encontrado');
    const memberships = await this.prisma.dirMembership.findMany({
      where: { clubId: id, active: true },
      orderBy: [{ isPresident: 'desc' }, { person: { fullName: 'asc' } }],
      include: { person: { select: { id: true, fullName: true, email: true } } },
    });
    return {
      ...toLegacyClub(club),
      authorities: memberships.map((m) => ({
        userId: m.personId,
        fullName: m.person.fullName,
        email: m.person.email ?? '',
        title: m.title ?? (m.isPresident ? 'Presidente' : null),
        isPresident: m.isPresident,
        activeFrom: null,
        activeUntil: null,
      })),
      recentReports: [],
    };
  }
}
