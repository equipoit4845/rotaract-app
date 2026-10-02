import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DirectoryService } from '../directory/directory.service';

export type QuorumStatus = {
  required: number;
  present: number;
  met: boolean;
  isInformationalOnly: boolean;
};

@Injectable()
export class QuorumService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clubStatus: DirectoryService,
  ) {}

  /**
   * Art. 41: Quorum = 2/3 de los clubes habilitados (base del quórum).
   */
  async calculateQuorumRequirement(): Promise<number> {
    const clubs = await this.clubStatus.getQuorumBaseClubs();
    return Math.ceil((clubs.length * 2) / 3);
  }

  /**
   * Check quorum for a specific meeting.
   * Tanto el requisito (2/3) como el conteo de presentes se calculan sobre los
   * clubes HABILITADOS. Un club presente que no esté habilitado no suma al quórum.
   * Los moderadores (secretario/RDR) no registran asistencia, así que nunca cuentan.
   */
  async checkQuorum(meetingId: string): Promise<QuorumStatus> {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
      select: { isDistrictMeeting: true },
    });

    if (!meeting?.isDistrictMeeting) {
      return { required: 0, present: 0, met: true, isInformationalOnly: false };
    }

    const baseClubs = await this.clubStatus.getQuorumBaseClubs();
    const habilitadoIds = new Set(baseClubs.map((c) => c.id));
    const required = Math.ceil((baseClubs.length * 2) / 3);

    const attendances = await this.prisma.clubMeetingAttendance.findMany({
      where: { meetingId },
      select: { clubId: true },
    });
    const presentClubs = attendances.filter((a) => habilitadoIds.has(a.clubId)).length;

    const met = presentClubs >= required;

    return {
      required,
      present: presentClubs,
      met,
      isInformationalOnly: !met,
    };
  }

  /**
   * Record a club's attendance at a meeting.
   * Called when a president or carta poder delegate joins.
   */
  async recordClubAttendance(
    meetingId: string,
    clubId: string,
    attendeeUserId: string,
    isDelegate = false,
    cartaPoderId?: string,
  ): Promise<void> {
    await this.prisma.clubMeetingAttendance.upsert({
      where: { meetingId_clubId: { meetingId, clubId } },
      create: {
        meetingId,
        clubId,
        attendeeUserId,
        isDelegate,
        cartaPoderId: cartaPoderId ?? null,
      },
      update: {
        attendeeUserId,
        isDelegate,
        cartaPoderId: cartaPoderId ?? null,
      },
    });
  }

  /**
   * Update meeting quorum status and return the current status.
   */
  async recheckAndUpdateQuorum(meetingId: string): Promise<QuorumStatus> {
    const status = await this.checkQuorum(meetingId);

    await this.prisma.meeting.update({
      where: { id: meetingId },
      data: {
        quorumRequired: status.required,
        quorumMet: status.met,
        isInformationalOnly: status.isInformationalOnly,
      },
    });

    return status;
  }
}
