import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CartaPoderStatus } from '../prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateCartaPoderDto } from './dto/create-carta-poder.dto';
import { DirectoryService } from '../directory/directory.service';
import { isDistrictAdmin, Role } from '../auth/role';

@Injectable()
export class CartaPoderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly directory: DirectoryService,
  ) {}

  /**
   * Deliberate fix (contract §Behaviour 3): only the president of that club
   * (or SECRETARY / RDR / SUPERADMIN) may create or read its carta poder.
   */
  async assertClubOwnership(clubId: string, userId: string, role: Role) {
    if (isDistrictAdmin(role)) return;
    if (!(await this.directory.isPresidentOf(userId, clubId))) {
      throw new ForbiddenException('Solo el presidente del club puede gestionar su carta poder');
    }
  }

  private async enrichCartaPoder(cp: {
    id: string;
    meetingId: string;
    clubId: string;
    presidentUserId: string;
    delegateUserId: string;
    status: CartaPoderStatus;
    verified: boolean;
    verifiedById: string | null;
    documentUrl: string | null;
    rejectionReason: string | null;
    receivedAt: Date;
  }) {
    const [club, delegateUser, presidentUser] = await Promise.all([
      this.prisma.dirClub.findUnique({ where: { id: cp.clubId }, select: { id: true, name: true } }),
      this.prisma.dirPerson.findUnique({ where: { id: cp.delegateUserId }, select: { id: true, fullName: true, email: true } }),
      this.prisma.dirPerson.findUnique({ where: { id: cp.presidentUserId }, select: { id: true, fullName: true, email: true } }),
    ]);
    return { ...cp, club, delegateUser, presidentUser };
  }

  /**
   * Art. 46: Create a carta poder for a club's delegate at a meeting.
   * Digital cartas must be received min 7 days before the meeting.
   */
  async create(meetingId: string, dto: CreateCartaPoderDto, presidentUserId: string, role: Role) {
    await this.assertClubOwnership(dto.clubId, presidentUserId, role);

    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
      select: { id: true, scheduledAt: true, status: true },
    });
    if (!meeting) throw new NotFoundException('Reunión no encontrada');
    if (meeting.status === 'FINISHED' || meeting.status === 'ARCHIVED') {
      throw new BadRequestException('No se puede crear carta poder para una reunión finalizada');
    }

    // Art. 46: 7 days before meeting for digital cartas
    if (meeting.scheduledAt) {
      const sevenDaysBefore = new Date(meeting.scheduledAt);
      sevenDaysBefore.setDate(sevenDaysBefore.getDate() - 7);
      if (new Date() > sevenDaysBefore && meeting.status !== 'DRAFT') {
        throw new BadRequestException(
          'Las cartas poder digitales deben recibirse con mínimo 7 días de anticipación (Art. 46)',
        );
      }
    }

    // Validate delegate user exists
    const delegate = (await this.directory.ensurePerson(dto.delegateUserId))
      ? await this.prisma.dirPerson.findUnique({ where: { id: dto.delegateUserId } })
      : null;
    if (!delegate) throw new NotFoundException('Usuario delegado no encontrado');

    // One carta poder per club per meeting
    const existing = await this.prisma.cartaPoder.findUnique({
      where: { meetingId_clubId: { meetingId, clubId: dto.clubId } },
    });
    if (existing) {
      throw new BadRequestException('Ya existe una carta poder para este club en esta reunión');
    }

    const cartaPoder = await this.prisma.cartaPoder.create({
      data: {
        meetingId,
        clubId: dto.clubId,
        presidentUserId,
        delegateUserId: dto.delegateUserId,
        documentUrl: dto.documentUrl ?? null,
        status: CartaPoderStatus.PENDING_SECRETARY,
      },
    });

    await this.audit.log({
      meetingId,
      actorUserId: presidentUserId,
      action: 'carta_poder.created',
      entityType: 'CartaPoder',
      entityId: cartaPoder.id,
    });

    return this.enrichCartaPoder(cartaPoder);
  }

  async verify(meetingId: string, cartaPoderId: string, verifiedById: string) {
    const cp = await this.prisma.cartaPoder.findFirst({
      where: { id: cartaPoderId, meetingId },
    });
    if (!cp) throw new NotFoundException('Carta poder no encontrada');
    if (cp.status === CartaPoderStatus.REJECTED) {
      throw new BadRequestException('La carta poder fue rechazada y no puede verificarse');
    }

    const updated = await this.prisma.cartaPoder.update({
      where: { id: cartaPoderId },
      data: { verified: true, verifiedById, status: CartaPoderStatus.VERIFIED, rejectionReason: null },
    });

    // Auto-add delegate as meeting participant with canVote and isDelegate
    await this.prisma.meetingParticipant.upsert({
      where: { meetingId_userId: { meetingId, userId: cp.delegateUserId } },
      create: {
        meetingId,
        userId: cp.delegateUserId,
        clubId: cp.clubId,
        canVote: true,
        isDelegate: true,
      },
      update: {
        clubId: cp.clubId,
        canVote: true,
        isDelegate: true,
      },
    });

    await this.audit.log({
      meetingId,
      actorUserId: verifiedById,
      action: 'carta_poder.verified',
      entityType: 'CartaPoder',
      entityId: cartaPoderId,
    });

    return this.enrichCartaPoder(updated);
  }

  async reject(meetingId: string, cartaPoderId: string, rejectorId: string, reason?: string) {
    const cp = await this.prisma.cartaPoder.findFirst({
      where: { id: cartaPoderId, meetingId },
    });
    if (!cp) throw new NotFoundException('Carta poder no encontrada');
    if (cp.status === CartaPoderStatus.VERIFIED) {
      throw new BadRequestException('La carta poder ya fue verificada');
    }

    const updated = await this.prisma.cartaPoder.update({
      where: { id: cartaPoderId },
      data: {
        status: CartaPoderStatus.REJECTED,
        verified: false,
        rejectionReason: reason ?? null,
      },
    });

    await this.audit.log({
      meetingId,
      actorUserId: rejectorId,
      action: 'carta_poder.rejected',
      entityType: 'CartaPoder',
      entityId: cartaPoderId,
      metadata: { reason },
    });

    return this.enrichCartaPoder(updated);
  }

  async findByMeeting(meetingId: string) {
    const list = await this.prisma.cartaPoder.findMany({
      where: { meetingId },
      orderBy: { receivedAt: 'desc' },
    });
    return Promise.all(list.map((cp) => this.enrichCartaPoder(cp)));
  }

  async findByMeetingAndClub(meetingId: string, clubId: string) {
    const list = await this.prisma.cartaPoder.findMany({
      where: { meetingId, clubId },
      orderBy: { receivedAt: 'desc' },
    });
    return Promise.all(list.map((cp) => this.enrichCartaPoder(cp)));
  }

  async remove(meetingId: string, cartaPoderId: string, actorUserId: string) {
    const cp = await this.prisma.cartaPoder.findFirst({
      where: { id: cartaPoderId, meetingId },
    });
    if (!cp) throw new NotFoundException('Carta poder no encontrada');

    await this.prisma.cartaPoder.delete({ where: { id: cartaPoderId } });

    await this.audit.log({
      meetingId,
      actorUserId,
      action: 'carta_poder.deleted',
      entityType: 'CartaPoder',
      entityId: cartaPoderId,
    });
  }
}
