import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, CurrentUserPayload } from './current-user.decorator';

@Controller('auth')
@UseGuards(AuthGuard('jwt'))
export class AuthController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Replaces legacy `/auth/me` for the meetings screens:
   * `{ id, fullName, email, role, clubs: [{ id, name, isPresident }] }`.
   */
  @Get('me')
  async me(@CurrentUser() user: CurrentUserPayload) {
    const memberships = await this.prisma.dirMembership.findMany({
      where: { personId: user.id, active: true },
      include: { club: { select: { id: true, name: true } } },
      orderBy: [{ isPresident: 'desc' }, { club: { name: 'asc' } }],
    });
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      clubs: memberships.map((m) => ({ id: m.club.id, name: m.club.name, isPresident: m.isPresident })),
    };
  }
}
