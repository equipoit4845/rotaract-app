import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { Role } from '../auth/role';
import { resolveRole } from '../auth/role-resolution';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { DirectoryService } from './directory.service';
import { DirectorySyncService } from './directory-sync.service';

/**
 * Person lookups used by the meetings screens (legacy `GET /users`, used by
 * the live console's candidate pickers), district staff management and the
 * directory sync status.
 */
@Controller()
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly directory: DirectoryService,
    private readonly sync: DirectorySyncService,
    private readonly audit: AuditService,
  ) {}

  /** Legacy `GET /users` (AdminUser shape) — active persons with active memberships. */
  @Get('users')
  @Roles(Role.SECRETARY, Role.PRESIDENT, Role.RDR, Role.SUPERADMIN)
  async listUsers() {
    const [persons, staff, districtRoles] = await Promise.all([
      this.prisma.dirPerson.findMany({
        where: { isActive: true },
        include: {
          memberships: {
            where: { active: true },
            include: { club: { select: { id: true, name: true, code: true } } },
          },
        },
        orderBy: { fullName: 'asc' },
      }),
      this.prisma.districtStaff.findMany(),
      this.prisma.dirDistrictRole.findMany(),
    ]);
    const staffBy = new Map(staff.map((s) => [s.personId, s.role]));
    const districtBy = new Map<string, ('RDR' | 'SECRETARY')[]>();
    for (const r of districtRoles) districtBy.set(r.personId, [...(districtBy.get(r.personId) ?? []), r.role]);
    return persons.map((p) => ({
      id: p.id,
      fullName: p.fullName,
      email: p.email ?? '',
      role: resolveRole({
        platformRole: p.platformRole,
        staffRole: staffBy.get(p.id) ?? null,
        districtRoles: districtBy.get(p.id) ?? [],
        isPresident: p.memberships.some((m) => m.isPresident),
      }),
      isActive: p.isActive,
      createdAt: p.createdAt,
      memberships: p.memberships.map((m) => ({
        clubId: m.clubId,
        title: m.title,
        isPresident: m.isPresident,
        club: m.club,
      })),
    }));
  }

  // --- District staff (local secretaries / superadmins) ------------------

  @Get('district-staff')
  @Roles(Role.SECRETARY, Role.RDR)
  async listStaff() {
    const staff = await this.prisma.districtStaff.findMany({ orderBy: { createdAt: 'asc' } });
    const persons = await this.prisma.dirPerson.findMany({
      where: { id: { in: staff.map((s) => s.personId) } },
      select: { id: true, fullName: true, email: true },
    });
    const byId = new Map(persons.map((p) => [p.id, p]));
    return staff.map((s) => ({ ...s, person: byId.get(s.personId) ?? null }));
  }

  @Put('district-staff/:personId')
  @Roles(Role.RDR)
  async upsertStaff(
    @Param('personId') personId: string,
    @Body() body: { role?: 'SECRETARY' | 'SUPERADMIN'; note?: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const role = body?.role ?? 'SECRETARY';
    if (role !== 'SECRETARY' && role !== 'SUPERADMIN') throw new BadRequestException('Rol inválido');
    // Only a SUPERADMIN can grant SUPERADMIN.
    if (role === 'SUPERADMIN' && user.role !== Role.SUPERADMIN) {
      throw new BadRequestException('Solo un SUPERADMIN puede otorgar SUPERADMIN');
    }
    const known = await this.directory.ensurePerson(personId);
    if (!known) throw new NotFoundException('Persona no encontrada');
    const row = await this.prisma.districtStaff.upsert({
      where: { personId },
      create: { personId, role, note: body?.note ?? null, createdById: user.id },
      update: { role, note: body?.note ?? null },
    });
    await this.audit.log({
      actorUserId: user.id,
      action: 'district_staff.upserted',
      entityType: 'DistrictStaff',
      entityId: personId,
      metadata: { role },
    });
    return row;
  }

  @Delete('district-staff/:personId')
  @Roles(Role.RDR)
  async removeStaff(@Param('personId') personId: string, @CurrentUser() user: CurrentUserPayload) {
    const existing = await this.prisma.districtStaff.findUnique({ where: { personId } });
    if (!existing) throw new NotFoundException('No encontrado');
    if (existing.role === 'SUPERADMIN' && user.role !== Role.SUPERADMIN) {
      throw new BadRequestException('Solo un SUPERADMIN puede quitar a un SUPERADMIN');
    }
    await this.prisma.districtStaff.delete({ where: { personId } });
    await this.audit.log({
      actorUserId: user.id,
      action: 'district_staff.removed',
      entityType: 'DistrictStaff',
      entityId: personId,
    });
    return { ok: true };
  }

  // --- Directory sync ------------------------------------------------------

  @Get('directory/status')
  @Roles(Role.SECRETARY, Role.RDR)
  status() {
    return this.sync.status();
  }

  @Post('directory/sync')
  @HttpCode(202)
  @Roles(Role.SECRETARY, Role.RDR)
  async triggerSync() {
    void this.sync.syncAll();
    return { accepted: true };
  }
}
