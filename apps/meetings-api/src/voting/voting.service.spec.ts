import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '../prisma/client';
import { VotingService } from './voting.service';

type Over = Record<string, unknown>;

function makeService(
  over: {
    session?: Over;
    meeting?: Over;
    participant?: Over | null;
    votes?: Over[];
    existingClubVoter?: Over | null;
    isRdr?: boolean;
  } = {},
) {
  const session = {
    id: 'vs1',
    meetingId: 'm1',
    topicId: 't1',
    status: 'OPEN',
    votingMethod: 'PUBLIC',
    requiredMajority: 'SIMPLE',
    ballotType: 'YES_NO',
    round: 1,
    eligibleClubIds: JSON.stringify(['clubA', 'clubB']),
    eligibleClubCount: 2,
    rdrTiebreakerUsed: false,
    rdrTiebreakerChoice: null,
    rdrTiebreakerCandidateId: null,
    candidates: [],
    ...over.session,
  };
  const prisma = {
    voteSession: {
      findFirst: jest.fn().mockResolvedValue(session),
      findUnique: jest.fn().mockResolvedValue(session),
      update: jest.fn().mockResolvedValue(session),
    },
    meeting: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 'm1', isDistrictMeeting: true, isInformationalOnly: false, ...over.meeting }),
    },
    meetingParticipant: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          over.participant === undefined ? { userId: 'u1', clubId: 'clubA', canVote: true } : over.participant,
        ),
      findFirst: jest.fn().mockResolvedValue(over.existingClubVoter ?? null),
      update: jest.fn(),
    },
    vote: {
      findMany: jest.fn().mockResolvedValue(over.votes ?? []),
      upsert: jest.fn().mockResolvedValue({ id: 'v1' }),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    voteCandidate: { findFirst: jest.fn(), count: jest.fn().mockResolvedValue(0) },
    motion: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const realtime = { emitToMeeting: jest.fn(), broadcastSnapshot: jest.fn() };
  const audit = { log: jest.fn() };
  const directory = {
    hasDistrictRole: jest.fn().mockResolvedValue(!!over.isRdr),
    getPrimaryMembership: jest.fn().mockResolvedValue(null),
    getRole: jest.fn(),
    getPresidentOf: jest.fn(),
  };
  const service = new VotingService(prisma as never, realtime as never, audit as never, directory as never);
  return { service, prisma, realtime, directory };
}

describe('VotingService.submitVote — one vote per club', () => {
  it('records the vote with the ballot club (DB-level uniqueness)', async () => {
    const { service, prisma } = makeService();
    await service.submitVote('m1', 'vs1', 'u1', 'YES');
    expect(prisma.vote.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ clubId: 'clubA', ballotClubId: 'clubA', choice: 'YES' }),
      }),
    );
  });

  it('rejects a second member of a club that already voted', async () => {
    const { service } = makeService({
      votes: [{ userId: 'u2' }],
      existingClubVoter: { userId: 'u2', clubId: 'clubA' },
    });
    await expect(service.submitVote('m1', 'vs1', 'u1', 'YES')).rejects.toThrow(
      'Tu club ya emitió un voto en esta votación',
    );
  });

  it('lets the same user change their vote (upsert)', async () => {
    const { service, prisma } = makeService({
      votes: [{ userId: 'u1' }],
      existingClubVoter: { userId: 'u1', clubId: 'clubA' },
    });
    await service.submitVote('m1', 'vs1', 'u1', 'NO');
    expect(prisma.vote.upsert).toHaveBeenCalled();
  });

  it('maps the unique-index race (P2002 on ballotClubId) to the club message', async () => {
    const { service, prisma } = makeService();
    prisma.vote.upsert.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'x',
        meta: { target: ['voteSessionId', 'ballotClubId'] },
      }),
    );
    await expect(service.submitVote('m1', 'vs1', 'u1', 'YES')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.submitVote('m1', 'vs1', 'u1', 'YES')).rejects.toThrow(
      'Tu club ya emitió un voto en esta votación',
    );
  });

  it('SECRET votes keep clubId null but still carry the ballot club', async () => {
    const { service, prisma } = makeService({ session: { votingMethod: 'SECRET' } });
    const res = await service.submitVote('m1', 'vs1', 'u1', 'YES');
    expect(prisma.vote.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ clubId: null, ballotClubId: 'clubA' }) }),
    );
    expect(res).toMatchObject({ yes: 0, no: 0, approved: null });
  });

  it('non-district meetings have no ballot club', async () => {
    const { service, prisma } = makeService({ meeting: { isDistrictMeeting: false } });
    await service.submitVote('m1', 'vs1', 'u1', 'YES');
    expect(prisma.vote.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ clubId: null, ballotClubId: null }) }),
    );
  });

  it('rejects a club that was not present when the vote opened', async () => {
    const { service } = makeService({ participant: { userId: 'u1', clubId: 'clubZ', canVote: true } });
    await expect(service.submitVote('m1', 'vs1', 'u1', 'YES')).rejects.toThrow(
      'Tu club no estaba presente al momento de abrir la votación',
    );
  });

  it('RDR cannot vote (Art. 49)', async () => {
    const { service } = makeService({ isRdr: true });
    await expect(service.submitVote('m1', 'vs1', 'u1', 'YES')).rejects.toThrow(/El RDR no puede votar/);
  });

  it('no quorum -> no votes (Art. 42)', async () => {
    const { service } = makeService({ meeting: { isInformationalOnly: true } });
    await expect(service.submitVote('m1', 'vs1', 'u1', 'YES')).rejects.toThrow(
      'No se pueden emitir votos sin quórum (Art. 42).',
    );
  });

  it('participants without voting rights are rejected', async () => {
    const { service } = makeService({ participant: null });
    await expect(service.submitVote('m1', 'vs1', 'u1', 'YES')).rejects.toThrow(
      'No tenés derecho a votar en esta reunión',
    );
  });
});

describe('VotingService tiebreaks and runoff', () => {
  it('YES_NO tiebreak requires a raw tie', async () => {
    const { service, prisma } = makeService({ session: { status: 'CLOSED' } });
    prisma.vote.groupBy.mockResolvedValue([
      { choice: 'YES', _count: 3 },
      { choice: 'NO', _count: 2 },
    ]);
    await expect(service.submitRdrTiebreaker('m1', 'vs1', 'rdr', 'YES')).rejects.toThrow(/No hay empate/);
  });

  it('YES_NO tiebreak applies once', async () => {
    const { service, prisma } = makeService({ session: { status: 'CLOSED', rdrTiebreakerUsed: true } });
    prisma.vote.groupBy.mockResolvedValue([]);
    await expect(service.submitRdrTiebreaker('m1', 'vs1', 'rdr', 'YES')).rejects.toThrow(
      'El desempate del RDR ya fue utilizado',
    );
  });

  it('YES_NO tiebreak on a tie stores the RDR choice', async () => {
    const { service, prisma } = makeService({ session: { status: 'CLOSED' } });
    prisma.vote.groupBy.mockResolvedValue([
      { choice: 'YES', _count: 2 },
      { choice: 'NO', _count: 2 },
    ]);
    await service.submitRdrTiebreaker('m1', 'vs1', 'rdr', 'NO');
    expect(prisma.voteSession.update).toHaveBeenCalledWith({
      where: { id: 'vs1' },
      data: { rdrTiebreakerUsed: true, rdrTiebreakerChoice: 'NO' },
    });
  });

  it('candidate tiebreak must pick one of the tied candidates', async () => {
    const candidates = [
      { id: 'a', displayName: 'A', userId: null },
      { id: 'b', displayName: 'B', userId: null },
      { id: 'c', displayName: 'C', userId: null },
    ];
    const { service, prisma } = makeService({ session: { status: 'CLOSED', ballotType: 'CANDIDATE', candidates } });
    prisma.vote.groupBy.mockResolvedValue([
      { candidateId: 'a', _count: { candidateId: 3 } },
      { candidateId: 'b', _count: { candidateId: 3 } },
      { candidateId: 'c', _count: { candidateId: 1 } },
    ]);
    await expect(service.submitRdrCandidateTiebreaker('m1', 'vs1', 'rdr', 'c')).rejects.toThrow(
      'El candidato seleccionado no está en el empate',
    );
    await service.submitRdrCandidateTiebreaker('m1', 'vs1', 'rdr', 'b');
    expect(prisma.voteSession.update).toHaveBeenCalledWith({
      where: { id: 'vs1' },
      data: { rdrTiebreakerUsed: true, rdrTiebreakerCandidateId: 'b' },
    });
  });

  it('runoff is refused when the previous round already has a winner', async () => {
    const candidates = [
      { id: 'a', displayName: 'A', userId: null },
      { id: 'b', displayName: 'B', userId: null },
    ];
    const { service, prisma } = makeService({ session: { status: 'CLOSED', ballotType: 'CANDIDATE', candidates } });
    prisma.vote.groupBy.mockResolvedValue([
      { candidateId: 'a', _count: { candidateId: 2 } },
      { candidateId: 'b', _count: { candidateId: 0 } },
    ]);
    await expect(service.openRunoff('m1', 'vs1', 'sec')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.openRunoff('m1', 'vs1', 'sec')).rejects.toThrow('Ya hubo un ganador en la ronda anterior');
  });
});
