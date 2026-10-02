import { QuorumService } from './quorum.service';

function setup(opts: { isDistrict?: boolean; base: string[]; present: string[] }) {
  const prisma = {
    meeting: {
      findUnique: jest.fn().mockResolvedValue({ isDistrictMeeting: opts.isDistrict ?? true }),
      update: jest.fn().mockResolvedValue({}),
    },
    clubMeetingAttendance: {
      findMany: jest.fn().mockResolvedValue(opts.present.map((clubId) => ({ clubId }))),
      upsert: jest.fn().mockResolvedValue({}),
    },
  };
  const directory = {
    getQuorumBaseClubs: jest.fn().mockResolvedValue(opts.base.map((id) => ({ id, name: id }))),
  };
  const service = new QuorumService(prisma as never, directory as never);
  return { service, prisma, directory };
}

describe('QuorumService (Art. 41-42)', () => {
  it('requirement is ceil(2/3 of the habilitado clubs)', async () => {
    expect(await setup({ base: ['a', 'b', 'c'], present: [] }).service.calculateQuorumRequirement()).toBe(2);
    expect(
      await setup({
        base: Array.from({ length: 10 }, (_, i) => `c${i}`),
        present: [],
      }).service.calculateQuorumRequirement(),
    ).toBe(7);
    expect(await setup({ base: [], present: [] }).service.calculateQuorumRequirement()).toBe(0);
  });

  it('met when present >= required', async () => {
    const { service } = setup({ base: ['a', 'b', 'c', 'd', 'e', 'f'], present: ['a', 'b', 'c', 'd'] });
    expect(await service.checkQuorum('m')).toEqual({ required: 4, present: 4, met: true, isInformationalOnly: false });
  });

  it('not met -> informational only', async () => {
    const { service } = setup({ base: ['a', 'b', 'c', 'd', 'e', 'f'], present: ['a', 'b', 'c'] });
    expect(await service.checkQuorum('m')).toEqual({ required: 4, present: 3, met: false, isInformationalOnly: true });
  });

  it('present clubs outside the habilitado base do not count', async () => {
    const { service } = setup({ base: ['a', 'b', 'c'], present: ['a', 'x', 'y', 'z'] });
    const q = await service.checkQuorum('m');
    expect(q.present).toBe(1);
    expect(q.met).toBe(false);
  });

  it('a non-district meeting always has quorum', async () => {
    const { service, directory } = setup({ isDistrict: false, base: ['a'], present: [] });
    expect(await service.checkQuorum('m')).toEqual({ required: 0, present: 0, met: true, isInformationalOnly: false });
    expect(directory.getQuorumBaseClubs).not.toHaveBeenCalled();
  });

  it('recheckAndUpdateQuorum persists the status on the meeting', async () => {
    const { service, prisma } = setup({ base: ['a', 'b', 'c'], present: ['a', 'b'] });
    await service.recheckAndUpdateQuorum('m');
    expect(prisma.meeting.update).toHaveBeenCalledWith({
      where: { id: 'm' },
      data: { quorumRequired: 2, quorumMet: true, isInformationalOnly: false },
    });
  });
});
