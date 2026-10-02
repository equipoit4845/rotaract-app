import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ActaStatus, VoteChoice } from '../prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AIService } from './ai.service';
import { DirectoryService } from '../directory/directory.service';

export type ActaContent = {
  header: {
    title: string;
    date: string | null;
    startedAt: string | null;
    endedAt: string | null;
    type: string;
    quorumRequired: number | null;
    quorumMet: boolean;
    isInformationalOnly: boolean;
    club: string | null;
  };
  attendance: {
    clubs: { name: string; representative: string; isDelegate: boolean }[];
    absent: string[];
  };
  topics: {
    topicId: string;
    order: number;
    title: string;
    type: string;
    summary: string;
    vote?: {
      method: string;
      majority: string;
      yes: number;
      no: number;
      abstain: number;
      total: number;
      approved: boolean | null;
      rdrTiebreaker: boolean;
      ballotType?: string;
      electionType?: string | null;
      options?: string[];
      candidates?: { name: string; votes: number }[];
      detailedVotes?: { clubName: string; choice: string; candidateName?: string | null }[];
    };
  }[];
  motions?: {
    id: string;
    title: string;
    description: string | null;
    proposedByClubName: string;
    secondedByClubName: string | null;
    status: string;
  }[];
  resolutions: { number: number; text: string; approved: boolean }[];
  observations: string;
  closingNotes: string;
};

@Injectable()
export class ActaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly aiService: AIService,
    private readonly directory: DirectoryService,
  ) {}

  async generateDraft(meetingId: string) {
    const existing = await this.prisma.meetingActa.findUnique({ where: { meetingId } });
    if (existing) return existing;

    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        club: { select: { name: true } },
        topics: { orderBy: { order: 'asc' } },
        voteSessions: {
          include: {
            topic: { select: { title: true } },
            votes: {
              include: {
                candidate: { select: { displayName: true } },
              },
            },
            candidates: { orderBy: { order: 'asc' } },
          },
          orderBy: { openedAt: 'asc' },
        },
        clubAttendances: {
          include: {
            club: { select: { name: true } },
          },
        },
        cartasPoder: {
          where: { verified: true },
          include: { club: { select: { name: true } } },
        },
        motions: {
          include: {
            proposedByClub: { select: { name: true } },
            secondedByClub: { select: { name: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!meeting) throw new NotFoundException('Reunión no encontrada');

    // Build attendance
    const presentClubs = meeting.clubAttendances.map((a) => {
      const cartaPoder = meeting.cartasPoder.find((cp) => cp.clubId === a.clubId);
      return {
        name: a.club.name,
        representative: a.attendeeUserId,
        isDelegate: a.isDelegate || !!cartaPoder,
      };
    });

    // Resolve representative names
    const userIds = presentClubs.map((c) => c.representative).filter((id): id is string => !!id);
    const users = userIds.length > 0
      ? await this.prisma.dirPerson.findMany({
          where: { id: { in: userIds } },
          select: { id: true, fullName: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u.fullName]));
    const attendanceClubs = presentClubs.map((c) => ({
      ...c,
      representative: c.representative ? (userMap.get(c.representative) ?? 'Desconocido') : 'Desconocido',
    }));

    // Get all enabled clubs to find absent ones
    const allClubs = await this.prisma.dirClub.findMany({
      where: this.directory.enabledClubsWhere(),
      select: { id: true, name: true },
    });
    const clubNameMap = new Map(allClubs.map((c) => [c.id, c.name]));
    const presentNames = new Set(attendanceClubs.map((c) => c.name));
    const absentClubs = allClubs.filter((c) => !presentNames.has(c.name)).map((c) => c.name);

    const voteByTopic = new Map(meeting.voteSessions.map((vs) => [vs.topicId, vs]));
    const topics: ActaContent['topics'] = meeting.topics.map((t, i) => {
      const vs = voteByTopic.get(t.id);
      const vote = this.buildVoteResult(vs, clubNameMap);
      return {
        topicId: t.id,
        order: i + 1,
        title: t.title,
        type: t.type,
        summary: '',
        vote,
      };
    });

    let resNum = 1;
    const resolutions: ActaContent['resolutions'] = topics
      .filter((t) => t.vote?.approved === true)
      .map((t) => ({
        number: resNum++,
        text: `Se aprueba: ${t.title}`,
        approved: true,
      }));

    // Map motions
    const motions = meeting.motions.map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      proposedByClubName: m.proposedByClub.name,
      secondedByClubName: m.secondedByClub?.name ?? null,
      status: m.status,
    }));

    const content: ActaContent = {
      header: {
        title: meeting.title,
        date: meeting.scheduledAt?.toISOString() ?? null,
        startedAt: meeting.startedAt?.toISOString() ?? null,
        endedAt: meeting.endedAt?.toISOString() ?? null,
        type: meeting.type,
        quorumRequired: meeting.quorumRequired,
        quorumMet: meeting.quorumMet,
        isInformationalOnly: meeting.isInformationalOnly,
        club: meeting.club?.name ?? null,
      },
      attendance: { clubs: attendanceClubs, absent: absentClubs },
      topics,
      motions,
      resolutions,
      observations: '',
      closingNotes: '',
    };

    const acta = await this.prisma.meetingActa.create({
      data: {
        meetingId,
        contentJson: JSON.stringify(content),
      },
    });

    await this.audit.log({
      meetingId,
      action: 'acta.generated',
      entityType: 'MeetingActa',
      entityId: acta.id,
    });

    return acta;
  }

  async findByMeeting(meetingId: string) {
    return this.prisma.meetingActa.findUnique({ where: { meetingId } });
  }

  async update(meetingId: string, contentJson: string, userId: string) {
    const acta = await this.prisma.meetingActa.findUnique({ where: { meetingId } });
    if (!acta) throw new NotFoundException('Acta no encontrada');
    if (acta.status === ActaStatus.PUBLISHED) {
      throw new BadRequestException('No se puede editar un acta publicada');
    }
    return this.prisma.meetingActa.update({
      where: { meetingId },
      data: { contentJson, updatedAt: new Date() },
    });
  }

  async publish(meetingId: string, userId: string) {
    const acta = await this.prisma.meetingActa.findUnique({ where: { meetingId } });
    if (!acta) throw new NotFoundException('Acta no encontrada');
    if (acta.status === ActaStatus.PUBLISHED) {
      throw new BadRequestException('El acta ya está publicada');
    }
    const updated = await this.prisma.meetingActa.update({
      where: { meetingId },
      data: { status: ActaStatus.PUBLISHED, publishedAt: new Date(), publishedById: userId },
    });
    await this.audit.log({
      meetingId,
      actorUserId: userId,
      action: 'acta.published',
      entityType: 'MeetingActa',
      entityId: acta.id,
    });
    return updated;
  }

  async generatePdf(meetingId: string): Promise<Buffer> {
    const acta = await this.prisma.meetingActa.findUnique({ where: { meetingId } });
    if (!acta) throw new NotFoundException('Acta no encontrada');

    const content: ActaContent = JSON.parse(acta.contentJson);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const PDFDocument = require('pdfkit');

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(18).font('Helvetica-Bold')
        .text('ACTA DE REUNIÓN', { align: 'center' });
      doc.fontSize(12).font('Helvetica')
        .text(`Distrito Rotaract 4845 R.I.`, { align: 'center' });
      doc.moveDown();

      // Meeting info
      doc.fontSize(14).font('Helvetica-Bold').text(content.header.title);
      doc.fontSize(10).font('Helvetica');
      const typeLabel = content.header.type === 'ORDINARY' ? 'Ordinaria' : 'Extraordinaria';
      doc.text(`Tipo: Reunión ${typeLabel}`);
      if (content.header.date) {
        doc.text(`Fecha: ${new Date(content.header.date).toLocaleString('es-AR', { dateStyle: 'long', timeStyle: 'short' })}`);
      }
      if (content.header.startedAt && content.header.endedAt) {
        const start = new Date(content.header.startedAt).toLocaleTimeString('es-AR', { timeStyle: 'short' });
        const end = new Date(content.header.endedAt).toLocaleTimeString('es-AR', { timeStyle: 'short' });
        doc.text(`Horario: ${start} — ${end}`);
      }
      doc.text(`Quórum: ${content.header.quorumMet ? 'Alcanzado' : 'No alcanzado'}${content.header.quorumRequired ? ` (${content.header.quorumRequired} requeridos)` : ''}`);
      if (content.header.isInformationalOnly) {
        doc.text('⚠ Reunión informativa — Sin quórum para tomar decisiones');
      }
      doc.moveDown();

      // Attendance
      doc.fontSize(12).font('Helvetica-Bold').text('Asistencia');
      doc.fontSize(10).font('Helvetica');
      if (content.attendance.clubs.length > 0) {
        doc.text('Clubes presentes:');
        for (const club of content.attendance.clubs) {
          const delegateTag = club.isDelegate ? ' (Delegado con Carta Poder)' : '';
          doc.text(`  • ${club.name} — ${club.representative}${delegateTag}`);
        }
      }
      if (content.attendance.absent.length > 0) {
        doc.moveDown(0.5);
        doc.text('Clubes ausentes:');
        for (const name of content.attendance.absent) {
          doc.text(`  • ${name}`);
        }
      }
      doc.moveDown();

      // Topics
      doc.fontSize(12).font('Helvetica-Bold').text('Orden del Día');
      doc.fontSize(10).font('Helvetica');
      for (const topic of content.topics) {
        doc.moveDown(0.5);
        doc.font('Helvetica-Bold').text(`${topic.order}. ${topic.title}`);
        doc.font('Helvetica');
        const typeLabels: Record<string, string> = { DISCUSSION: 'Discusión', VOTING: 'Votación', INFORMATIVE: 'Informativo' };
        doc.text(`Tipo: ${typeLabels[topic.type] ?? topic.type}`);
        if (topic.summary) doc.text(topic.summary);
        if (topic.vote) {
          const majorityLabels: Record<string, string> = { SIMPLE: 'Mayoría Simple', TWO_THIRDS: 'Dos Tercios', THREE_QUARTERS: 'Tres Cuartos' };
          const methodLabel = topic.vote.method === 'SECRET' ? 'Secreta' : 'Pública';

          if (topic.vote.electionType) {
            const electionLabel = topic.vote.electionType === 'RDR' ? 'Elección de RDR' : 'Elección de Sede';
            const optionsText = topic.vote.options && topic.vote.options.length > 0 ? topic.vote.options.join(', ') : 'Ninguna';
            doc.font('Helvetica-Bold').text(`${electionLabel} — Opciones a votar: `, { continued: true });
            doc.font('Helvetica').text(optionsText);
          }

          if (topic.vote.ballotType === 'CANDIDATE' && topic.vote.candidates) {
            doc.text(`Votación ${methodLabel} (Elección de Candidatos):`);
            for (const c of topic.vote.candidates) {
              doc.text(`  • ${c.name}: ${c.votes} votos`);
            }
            doc.text(`  • Abstención: ${topic.vote.abstain}`);
          } else {
            doc.text(`Votación ${methodLabel} (${majorityLabels[topic.vote.majority] ?? topic.vote.majority}): A favor: ${topic.vote.yes} | En contra: ${topic.vote.no} | Abstención: ${topic.vote.abstain}`);
          }

          if (topic.vote.approved !== null) {
            doc.font('Helvetica-Bold').text(`Resultado: ${topic.vote.approved ? 'APROBADA' : 'RECHAZADA'}`, { continued: false });
            doc.font('Helvetica');
          }
          if (topic.vote.rdrTiebreaker) {
            doc.text('(Desempate por el RDR — Art. 49)');
          }

          if (topic.vote.method === 'PUBLIC' && topic.vote.detailedVotes && topic.vote.detailedVotes.length > 0) {
            doc.moveDown(0.2);
            doc.font('Helvetica-Oblique').text('Desglose de votos individuales:');
            doc.font('Helvetica');
            for (const dv of topic.vote.detailedVotes) {
              const choiceLabel = dv.choice === 'YES' ? 'A favor' : dv.choice === 'NO' ? 'En contra' : dv.choice === 'ABSTAIN' ? 'Abstención' : dv.choice;
              const candidateLabel = dv.candidateName ? ` (Candidato: ${dv.candidateName})` : '';
              doc.text(`  - ${dv.clubName}: ${choiceLabel}${candidateLabel}`);
            }
          }
        }
      }
      doc.moveDown();

      // Motions
      if (content.motions && content.motions.length > 0) {
        doc.fontSize(12).font('Helvetica-Bold').text('Mociones');
        doc.fontSize(10).font('Helvetica');
        for (const motion of content.motions) {
          const seconderText = motion.secondedByClubName ? ` (Secundada por ${motion.secondedByClubName})` : ' (Sin secundar)';
          const motionStatusLabels: Record<string, string> = {
            PROPOSED: 'Propuesta',
            SECONDED: 'Secundada',
            VOTING: 'En Votación',
            APPROVED: 'Aprobada',
            REJECTED: 'Rechazada',
          };
          doc.text(`Moción: "${motion.title}" — Propuesta por: ${motion.proposedByClubName}${seconderText}`);
          if (motion.description) {
            doc.text(`Descripción: ${motion.description}`);
          }
          doc.text(`Estado: ${motionStatusLabels[motion.status] ?? motion.status}`);
          doc.moveDown(0.3);
        }
        doc.moveDown();
      }

      // Resolutions
      if (content.resolutions.length > 0) {
        doc.fontSize(12).font('Helvetica-Bold').text('Resoluciones');
        doc.fontSize(10).font('Helvetica');
        for (const res of content.resolutions) {
          doc.text(`Resolución N° ${res.number}: ${res.text}`);
        }
        doc.moveDown();
      }

      // Observations
      if (content.observations) {
        doc.fontSize(12).font('Helvetica-Bold').text('Observaciones');
        doc.fontSize(10).font('Helvetica').text(content.observations);
        doc.moveDown();
      }

      if (content.closingNotes) {
        doc.fontSize(12).font('Helvetica-Bold').text('Notas de Cierre');
        doc.fontSize(10).font('Helvetica').text(content.closingNotes);
        doc.moveDown();
      }

      // Footer
      doc.moveDown(2);
      doc.fontSize(8).fillColor('#999')
        .text(`Acta generada por Mi Rotaract — ${new Date().toLocaleString('es-AR')}`, { align: 'center' });

      doc.end();
    });
  }

  async autocompleteAI(meetingId: string, forceOverwrite = false) {
    let acta = await this.prisma.meetingActa.findUnique({ where: { meetingId } });
    if (!acta) {
      acta = await this.generateDraft(meetingId);
    }

    if (acta.status === ActaStatus.PUBLISHED) {
      throw new BadRequestException('No se puede modificar un acta ya publicada');
    }

    const content: ActaContent = JSON.parse(acta.contentJson);

    // Fetch topics, transcriptions, vote sessions and motions
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        topics: {
          orderBy: { order: 'asc' },
          include: {
            transcriptions: {
              orderBy: { createdAt: 'asc' },
              include: {
                user: {
                  include: {
                    memberships: {
                      where: { active: true },
                      orderBy: [{ isPresident: 'desc' }, { syncedAt: 'asc' }],
                      include: {
                        club: {
                          select: { name: true },
                        },
                      },
                    },
                  },
                },
              },
            },
            voteSessions: {
              include: {
                votes: {
                  include: {
                    candidate: true,
                  },
                },
                candidates: true,
              },
              orderBy: { openedAt: 'asc' },
            },
          },
        },
        motions: {
          include: {
            proposedByClub: { select: { name: true } },
            secondedByClub: { select: { name: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!meeting) throw new NotFoundException('Reunión no encontrada');

    // Get all enabled clubs to map public nominal votes
    const allClubs = await this.prisma.dirClub.findMany({
      where: this.directory.enabledClubsWhere(),
      select: { id: true, name: true },
    });
    const clubNameMap = new Map(allClubs.map((c) => [c.id, c.name]));

    const limit = 3;
    const tasks = content.topics.map((topicInContent) => async () => {
      // Find the corresponding database topic by ID, falling back to title match
      const dbTopic = meeting.topics.find((t) => t.id === topicInContent.topicId || t.title === topicInContent.title);
      if (!dbTopic) return;

      // Update topicId in case it was created via title fallback
      if (!topicInContent.topicId) {
        topicInContent.topicId = dbTopic.id;
      }

      // Check if we already have a summary and should not overwrite
      if (!forceOverwrite && topicInContent.summary && topicInContent.summary.trim() !== '') {
        return;
      }

      const transcriptions = dbTopic.transcriptions.map((tr: any) => {
        // Miembros de mesa directiva (p. ej. el RDR) pueden no tener club
        const clubName = tr.user?.memberships?.[0]?.club?.name ?? null;
        return {
          userName: tr.userName,
          userClub: clubName,
          text: tr.text,
        };
      });

      // Map vote details if there's an active/closed vote session
      const vs = dbTopic.voteSessions.find((s) => s.status === 'CLOSED');
      const voteDetails = this.buildVoteResult(vs, clubNameMap);

      // Map motions related to this topic
      const topicVoteSessionIds = new Set(dbTopic.voteSessions.map((vs) => vs.id));
      const topicMotions = meeting.motions
        .filter((m) => m.voteSessionId && topicVoteSessionIds.has(m.voteSessionId))
        .map((m) => ({
          title: m.title,
          description: m.description,
          proposedByClubName: m.proposedByClub.name,
          secondedByClubName: m.secondedByClub?.name ?? null,
          status: m.status,
        }));

      try {
        const summary = await this.aiService.summarizeTopic(
          dbTopic.title,
          dbTopic.description,
          transcriptions,
          voteDetails,
          topicMotions,
        );
        topicInContent.summary = summary;
      } catch (error) {
        console.error(`Error generating AI summary for topic ${dbTopic.title}:`, error);
        // Tolerate failure per topic, do not crash the entire minutes generation
      }
    });

    // Execute with limited concurrency
    const executing = new Set<Promise<any>>();
    for (const task of tasks) {
      const p = Promise.resolve().then(() => task());
      executing.add(p);
      p.then(() => executing.delete(p));
      if (executing.size >= limit) {
        await Promise.race(executing);
      }
    }
    await Promise.all(executing);

    // Save updated contentJson back to db
    const updatedActa = await this.prisma.meetingActa.update({
      where: { id: acta.id },
      data: {
        contentJson: JSON.stringify(content),
      },
    });

    return updatedActa;
  }

  private buildVoteResult(vs: any, clubNameMap: Map<string, string>): ActaContent['topics'][0]['vote'] | undefined {
    if (!vs || vs.status !== 'CLOSED') return undefined;

    const counts = { YES: 0, NO: 0, ABSTAIN: 0 };
    for (const v of vs.votes) {
      if (v.choice === 'YES' || v.choice === 'NO' || v.choice === 'ABSTAIN') {
        counts[v.choice as 'YES' | 'NO' | 'ABSTAIN']++;
      }
    }

    let approved: boolean | null = null;
    const votesForMajority = counts.YES + counts.NO;
    if (votesForMajority > 0) {
      switch (vs.requiredMajority) {
        case 'SIMPLE': approved = counts.YES > counts.NO; break;
        case 'TWO_THIRDS': approved = counts.YES >= (votesForMajority * 2) / 3; break;
        case 'THREE_QUARTERS': approved = counts.YES >= (votesForMajority * 3) / 4; break;
        default: approved = counts.YES > counts.NO;
      }
    }

    if (vs.rdrTiebreakerUsed && vs.rdrTiebreakerChoice) {
      if (vs.rdrTiebreakerChoice === VoteChoice.YES) approved = true;
      else if (vs.rdrTiebreakerChoice === VoteChoice.NO) approved = false;
    }

    let candidates: { name: string; votes: number }[] | undefined;
    if (vs.ballotType === 'CANDIDATE') {
      const candidatesMap = new Map<string, { name: string; votes: number }>(
        vs.candidates.map((c: any) => [c.id, { name: c.displayName, votes: 0 }]),
      );
      for (const v of vs.votes) {
        if (v.candidateId && candidatesMap.has(v.candidateId)) {
          candidatesMap.get(v.candidateId)!.votes++;
        }
      }
      candidates = Array.from(candidatesMap.values()).map((c: any) => ({
        name: c.name,
        votes: c.votes,
      }));
    }

    let detailedVotes: { clubName: string; choice: string; candidateName?: string | null }[] | undefined;
    if (vs.votingMethod === 'PUBLIC') {
      detailedVotes = vs.votes.map((v: any) => {
        const clubName = v.clubId ? clubNameMap.get(v.clubId) ?? 'Desconocido' : 'Desconocido';
        return {
          clubName,
          choice: v.choice,
          candidateName: v.candidate?.displayName ?? null,
        };
      });
    }

    return {
      method: vs.votingMethod,
      majority: vs.requiredMajority,
      yes: counts.YES,
      no: counts.NO,
      abstain: counts.ABSTAIN,
      total: vs.votes.length,
      approved,
      rdrTiebreaker: vs.rdrTiebreakerUsed,
      ballotType: vs.ballotType,
      electionType: vs.electionType ?? null,
      options: vs.candidates.map((c: any) => c.displayName),
      candidates,
      detailedVotes,
    };
  }
}
