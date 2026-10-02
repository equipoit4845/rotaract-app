import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '../prisma/client';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CartaPoderService } from './carta-poder.service';
import { CreateCartaPoderDto } from './dto/create-carta-poder.dto';

@Controller('meetings/:meetingId/carta-poder')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class CartaPoderController {
  constructor(private readonly cartaPoderService: CartaPoderService) {}

  @Post()
  @Roles(Role.PRESIDENT, Role.RDR, Role.SECRETARY)
  create(
    @Param('meetingId') meetingId: string,
    @Body() dto: CreateCartaPoderDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.cartaPoderService.create(meetingId, dto, user.id, user.role as Role);
  }

  /** Secretary/RDR: list all delegations for a meeting */
  @Get()
  @Roles(Role.SECRETARY, Role.RDR, Role.PRESIDENT)
  findAll(
    @Param('meetingId') meetingId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    // PRESIDENT can only see their own club's delegations (filtered client-side from full list for SECRETARY/RDR)
    return this.cartaPoderService.findByMeeting(meetingId);
  }

  /** President: list their own club's carta poder for a meeting */
  @Get('my-club/:clubId')
  @Roles(Role.PRESIDENT, Role.RDR, Role.SECRETARY)
  async findMyClub(
    @Param('meetingId') meetingId: string,
    @Param('clubId') clubId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    // Deliberate fix (contract §Behaviour 3): ownership check.
    await this.cartaPoderService.assertClubOwnership(clubId, user.id, user.role as Role);
    return this.cartaPoderService.findByMeetingAndClub(meetingId, clubId);
  }

  @Patch(':cpId/verify')
  @Roles(Role.SECRETARY)
  verify(
    @Param('meetingId') meetingId: string,
    @Param('cpId') cpId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.cartaPoderService.verify(meetingId, cpId, user.id);
  }

  @Patch(':cpId/reject')
  @Roles(Role.SECRETARY)
  reject(
    @Param('meetingId') meetingId: string,
    @Param('cpId') cpId: string,
    @Body('reason') reason: string | undefined,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.cartaPoderService.reject(meetingId, cpId, user.id, reason);
  }

  @Delete(':cpId')
  @Roles(Role.SECRETARY, Role.RDR)
  remove(
    @Param('meetingId') meetingId: string,
    @Param('cpId') cpId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.cartaPoderService.remove(meetingId, cpId, user.id);
  }
}
