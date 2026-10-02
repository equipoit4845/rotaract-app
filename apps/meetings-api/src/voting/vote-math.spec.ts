import { computeCandidateResult, computeYesNoResult, maskSecretResult, YesNoSessionInput } from './vote-math';

const yesNo = (over: Partial<NonNullable<YesNoSessionInput>> = {}): NonNullable<YesNoSessionInput> => ({
  requiredMajority: 'SIMPLE',
  rdrTiebreakerUsed: false,
  rdrTiebreakerChoice: null,
  votingMethod: 'PUBLIC',
  eligibleClubCount: null,
  ballotType: 'YES_NO',
  round: 1,
  ...over,
});
const counts = (yes: number, no: number, abstain = 0) => ({ yes, no, abstain, total: yes + no + abstain });

describe('computeYesNoResult', () => {
  it('SIMPLE: yes > no approves, yes < no rejects', () => {
    expect(computeYesNoResult('s', yesNo(), counts(5, 3)).approved).toBe(true);
    expect(computeYesNoResult('s', yesNo(), counts(3, 5)).approved).toBe(false);
  });

  it('abstentions do not count towards the majority', () => {
    const r = computeYesNoResult('s', yesNo(), counts(2, 1, 10));
    expect(r.approved).toBe(true);
    expect(r.total).toBe(13);
    expect(r.abstain).toBe(10);
  });

  it('tie and no votes give approved=null', () => {
    const tie = computeYesNoResult('s', yesNo(), counts(4, 4));
    expect(tie.isTied).toBe(true);
    expect(tie.approved).toBeNull();
    const none = computeYesNoResult('s', yesNo(), counts(0, 0, 3));
    // 0 == 0 counts as tied, as in legacy
    expect(none.isTied).toBe(true);
    expect(none.approved).toBeNull();
  });

  it('ABSOLUTE is measured over the eligible clubs', () => {
    // 10 eligible: 6 > 5 approves, 5 does not, even if no=0
    expect(computeYesNoResult('s', yesNo({ requiredMajority: 'ABSOLUTE', eligibleClubCount: 10 }), counts(6, 1)).approved).toBe(true);
    expect(computeYesNoResult('s', yesNo({ requiredMajority: 'ABSOLUTE', eligibleClubCount: 10 }), counts(5, 0)).approved).toBe(false);
  });

  it('ABSOLUTE falls back to yes+no when there is no eligible count', () => {
    expect(computeYesNoResult('s', yesNo({ requiredMajority: 'ABSOLUTE' }), counts(3, 2)).approved).toBe(true);
  });

  it('TWO_THIRDS: yes >= 2E/3', () => {
    const s = yesNo({ requiredMajority: 'TWO_THIRDS', eligibleClubCount: 9 });
    expect(computeYesNoResult('s', s, counts(6, 0)).approved).toBe(true);
    expect(computeYesNoResult('s', s, counts(5, 0)).approved).toBe(false);
  });

  it('THREE_QUARTERS: yes >= 3E/4', () => {
    const s = yesNo({ requiredMajority: 'THREE_QUARTERS', eligibleClubCount: 8 });
    expect(computeYesNoResult('s', s, counts(6, 2)).approved).toBe(true);
    expect(computeYesNoResult('s', s, counts(5, 0)).approved).toBe(false);
  });

  it('RDR tiebreak decides and is added to the public counts', () => {
    const r = computeYesNoResult('s', yesNo({ rdrTiebreakerUsed: true, rdrTiebreakerChoice: 'YES' }), counts(3, 3));
    expect(r.approved).toBe(true);
    expect(r.yes).toBe(4);
    expect(r.isTied).toBe(false);
    const n = computeYesNoResult('s', yesNo({ rdrTiebreakerUsed: true, rdrTiebreakerChoice: 'NO' }), counts(3, 3));
    expect(n.approved).toBe(false);
    expect(n.no).toBe(4);
  });

  it('RDR tiebreak is not added to SECRET counts', () => {
    const r = computeYesNoResult(
      's',
      yesNo({ votingMethod: 'SECRET', rdrTiebreakerUsed: true, rdrTiebreakerChoice: 'YES' }),
      counts(3, 3),
    );
    expect(r.yes).toBe(3);
    expect(r.approved).toBe(true);
  });

  it('maskSecretResult hides counts but keeps total', () => {
    const masked = maskSecretResult(computeYesNoResult('s', yesNo({ votingMethod: 'SECRET' }), counts(3, 1)));
    expect(masked).toMatchObject({ yes: 0, no: 0, abstain: 0, total: 4, approved: null, isTied: null, candidateResult: null });
  });
});

const cands = [
  { id: 'a', displayName: 'A', userId: null },
  { id: 'b', displayName: 'B', userId: null },
  { id: 'c', displayName: 'C', userId: null },
];
const cand = (over: Partial<Parameters<typeof computeCandidateResult>[0]> = {}) => ({
  candidates: cands,
  eligibleClubCount: null as number | null,
  requiredMajority: 'SIMPLE' as const,
  rdrTiebreakerUsed: false,
  rdrTiebreakerCandidateId: null as string | null,
  votingMethod: 'PUBLIC' as const,
  round: 1,
  ...over,
});
const vc = (a: number, b: number, c = 0) => [
  { candidateId: 'a', count: a },
  { candidateId: 'b', count: b },
  { candidateId: 'c', count: c },
];

describe('computeCandidateResult', () => {
  it('SIMPLE: the most voted wins, sorted with rounded pct', () => {
    const r = computeCandidateResult(cand(), vc(5, 3, 1));
    expect(r.winner?.candidateId).toBe('a');
    expect(r.candidateResults.map((c) => c.candidateId)).toEqual(['a', 'b', 'c']);
    expect(r.candidateResults[0].pct).toBe(56);
    expect(r.needsRunoff).toBe(false);
  });

  it('ABSOLUTE over eligible clubs: no winner -> runoff with the top two in round 1', () => {
    const r = computeCandidateResult(cand({ requiredMajority: 'ABSOLUTE', eligibleClubCount: 12 }), vc(6, 4, 2));
    expect(r.winner).toBeNull();
    expect(r.needsRunoff).toBe(true);
    expect(r.runoffCandidates.map((c) => c.candidateId)).toEqual(['a', 'b']);
  });

  it('ABSOLUTE met wins in round 1', () => {
    const r = computeCandidateResult(cand({ requiredMajority: 'ABSOLUTE', eligibleClubCount: 12 }), vc(7, 4, 1));
    expect(r.winner?.candidateId).toBe('a');
  });

  it('ABSOLUTE uses total votes when there is no eligible count', () => {
    expect(computeCandidateResult(cand({ requiredMajority: 'ABSOLUTE' }), vc(3, 2)).winner?.candidateId).toBe('a');
    expect(computeCandidateResult(cand({ requiredMajority: 'ABSOLUTE' }), vc(2, 1, 1)).winner).toBeNull();
  });

  it('TWO_THIRDS and THREE_QUARTERS thresholds', () => {
    expect(computeCandidateResult(cand({ requiredMajority: 'TWO_THIRDS', eligibleClubCount: 9 }), vc(6, 3)).winner?.candidateId).toBe('a');
    expect(computeCandidateResult(cand({ requiredMajority: 'TWO_THIRDS', eligibleClubCount: 9 }), vc(5, 4)).needsRunoff).toBe(true);
    expect(computeCandidateResult(cand({ requiredMajority: 'THREE_QUARTERS', eligibleClubCount: 8 }), vc(6, 2)).winner?.candidateId).toBe('a');
    expect(computeCandidateResult(cand({ requiredMajority: 'THREE_QUARTERS', eligibleClubCount: 8 }), vc(5, 3)).needsRunoff).toBe(true);
  });

  it('a tie at the top in round 1 needs a runoff', () => {
    const r = computeCandidateResult(cand(), vc(4, 4, 1));
    expect(r.isTied).toBe(true);
    expect(r.winner).toBeNull();
    expect(r.needsRunoff).toBe(true);
  });

  it('round 2: the top candidate wins by simple majority whatever the threshold', () => {
    const r = computeCandidateResult(
      cand({ round: 2, requiredMajority: 'ABSOLUTE', eligibleClubCount: 20, candidates: cands.slice(0, 2) }),
      vc(5, 4),
    );
    expect(r.winner?.candidateId).toBe('a');
    expect(r.needsRunoff).toBe(false);
  });

  it('round 2 tie: no winner, no further runoff (RDR tiebreak needed)', () => {
    const r = computeCandidateResult(cand({ round: 2, candidates: cands.slice(0, 2) }), vc(4, 4));
    expect(r.isTied).toBe(true);
    expect(r.winner).toBeNull();
    expect(r.needsRunoff).toBe(false);
  });

  it('RDR candidate tiebreak picks the winner', () => {
    const r = computeCandidateResult(
      cand({ round: 2, candidates: cands.slice(0, 2), rdrTiebreakerUsed: true, rdrTiebreakerCandidateId: 'b' }),
      vc(4, 4),
    );
    expect(r.winner?.candidateId).toBe('b');
    expect(r.isTied).toBe(false);
    expect(r.rdrTiebreakerCandidateId).toBe('b');
  });

  it('RDR candidate tiebreak id is hidden for SECRET sessions', () => {
    const r = computeCandidateResult(
      cand({ votingMethod: 'SECRET', rdrTiebreakerUsed: true, rdrTiebreakerCandidateId: 'b' }),
      vc(4, 4),
    );
    expect(r.winner?.candidateId).toBe('b');
    expect(r.rdrTiebreakerCandidateId).toBeNull();
  });

  it('single candidate with zero votes: no winner and no runoff', () => {
    const r = computeCandidateResult(cand({ candidates: cands.slice(0, 1) }), [{ candidateId: 'a', count: 0 }]);
    expect(r.winner).toBeNull();
    expect(r.needsRunoff).toBe(false);
  });
});
