import { CartaPoderService } from './carta-poder.service';

const DAY = 24 * 3600 * 1000;

function setup(
  over: {
    meeting?: Record<string, unknown> | null;
    existing?: unknown;
    delegate?: boolean;
    isPresident?: boolean;
    cp?: Record<string, unknown>;
  } = {},
) {
  const prisma = {
    meeting: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          over.meeting === null ? null : { id: 'm1', scheduledAt: null, status: 'DRAFT', ...over.meeting },
        ),
    },
    cartaPoder: {
      findUnique: jest.fn().mockResolvedValue(over.existing ?? null),
      findFirst: jest.fn().mockResolvedValue({
        id: 'cp1',
        meetingId: 'm1',
        clubId: 'clubA',
        delegateUserId: 'd1',
        status: 'PENDING_SECRETARY',
        ...over.cp,
      }),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'cp1', ...data })),
      update: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ id: 'cp1', clubId: 'clubA', presidentUserId: 'p1', delegateUserId: 'd1', ...data }),
        ),
    },
    dirPerson: { findUnique: jest.fn().mockResolvedValue(over.delegate === false ? null : { id: 'd1' }) },
    dirClub: { findUnique: jest.fn().mockResolvedValue({ id: 'clubA', name: 'Club A' }) },
    meetingParticipant: { upsert: jest.fn() },
  };
  const audit = { log: jest.fn() };
  const directory = {
    ensurePerson: jest.fn().mockResolvedValue(over.delegate !== false),
    isPresidentOf: jest.fn().mockResolvedValue(over.isPresident ?? true),
  };
  return { service: new CartaPoderService(prisma as never, audit as never, directory as never), prisma, directory };
}

const dto = { clubId: 'clubA', delegateUserId: 'd1' };

describe('CartaPoderService (Art. 46)', () => {
  it('the president of the club creates it as PENDING_SECRETARY', async () => {
    const { service, prisma } = setup();
    const cp = await service.create('m1', dto, 'p1', 'PRESIDENT');
    expect(cp.status).toBe('PENDING_SECRETARY');
    expect(prisma.cartaPoder.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ presidentUserId: 'p1', delegateUserId: 'd1' }) }),
    );
  });

  it('a president of another club cannot create it', async () => {
    const { service } = setup({ isPresident: false });
    await expect(service.create('m1', dto, 'p2', 'PRESIDENT')).rejects.toThrow(
      'Solo el presidente del club puede gestionar su carta poder',
    );
  });

  it('district admins may create it for any club', async () => {
    const { service, directory } = setup({ isPresident: false });
    await expect(service.create('m1', dto, 'sec', 'SECRETARY')).resolves.toBeDefined();
    expect(directory.isPresidentOf).not.toHaveBeenCalled();
  });

  it('rejected for finished meetings', async () => {
    const { service } = setup({ meeting: { status: 'FINISHED' } });
    await expect(service.create('m1', dto, 'p1', 'PRESIDENT')).rejects.toThrow(
      'No se puede crear carta poder para una reunión finalizada',
    );
  });

  it('7-day rule: rejected within 7 days of the meeting unless DRAFT', async () => {
    const soon = new Date(Date.now() + 3 * DAY);
    const { service } = setup({ meeting: { status: 'SCHEDULED', scheduledAt: soon } });
    await expect(service.create('m1', dto, 'p1', 'PRESIDENT')).rejects.toThrow(/7 días de anticipación/);
    const draft = setup({ meeting: { status: 'DRAFT', scheduledAt: soon } });
    await expect(draft.service.create('m1', dto, 'p1', 'PRESIDENT')).resolves.toBeDefined();
    const far = setup({ meeting: { status: 'SCHEDULED', scheduledAt: new Date(Date.now() + 30 * DAY) } });
    await expect(far.service.create('m1', dto, 'p1', 'PRESIDENT')).resolves.toBeDefined();
  });

  it('the delegate must exist', async () => {
    const { service } = setup({ delegate: false });
    await expect(service.create('m1', dto, 'p1', 'PRESIDENT')).rejects.toThrow('Usuario delegado no encontrado');
  });

  it('one carta per club and meeting', async () => {
    const { service } = setup({ existing: { id: 'other' } });
    await expect(service.create('m1', dto, 'p1', 'PRESIDENT')).rejects.toThrow(
      'Ya existe una carta poder para este club en esta reunión',
    );
  });

  it('verify enables the delegate as a voting participant', async () => {
    const { service, prisma } = setup();
    const cp = await service.verify('m1', 'cp1', 'sec');
    expect(cp.status).toBe('VERIFIED');
    expect(prisma.meetingParticipant.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ userId: 'd1', clubId: 'clubA', canVote: true, isDelegate: true }),
      }),
    );
  });

  it('a rejected carta cannot be verified, a verified one cannot be rejected', async () => {
    await expect(setup({ cp: { status: 'REJECTED' } }).service.verify('m1', 'cp1', 'sec')).rejects.toThrow(
      'La carta poder fue rechazada y no puede verificarse',
    );
    await expect(setup({ cp: { status: 'VERIFIED' } }).service.reject('m1', 'cp1', 'sec')).rejects.toThrow(
      'La carta poder ya fue verificada',
    );
  });
});
