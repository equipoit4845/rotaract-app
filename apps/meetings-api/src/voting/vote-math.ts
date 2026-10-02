import { BallotType, MajorityType, VoteChoice, VotingMethod } from '../prisma/client';

/**
 * Pure vote arithmetic, extracted verbatim from the legacy VotingService
 * (evaluateResult / evaluateCandidateResult / candidateMeetsThreshold) so it
 * can be unit tested. The service feeds it the session row and the counts.
 */

export type CandidateResult = {
  candidateId: string;
  displayName: string;
  userId: string | null;
  votes: number;
  pct: number;
};

export type CandidateVoteResult = {
  candidateResults: CandidateResult[];
  winner: CandidateResult | null;
  needsRunoff: boolean;
  runoffCandidates: CandidateResult[];
  isTied: boolean;
  totalVotes: number;
  eligibleCount: number;
  rdrTiebreakerUsed: boolean;
  rdrTiebreakerCandidateId: string | null;
};

export type VoteResult = {
  voteSessionId: string;
  yes: number;
  no: number;
  abstain: number;
  total: number;
  eligibleClubCount: number | null;
  approved: boolean | null;
  requiredMajority: MajorityType;
  isTied: boolean;
  rdrTiebreakerUsed: boolean;
  ballotType: BallotType;
  round: number;
  candidateResult?: CandidateVoteResult | null;
};

export type ChoiceCounts = { yes: number; no: number; abstain: number; total: number };

export type YesNoSessionInput = {
  requiredMajority: MajorityType;
  rdrTiebreakerUsed: boolean;
  rdrTiebreakerChoice: VoteChoice | null;
  votingMethod: VotingMethod;
  eligibleClubCount: number | null;
  ballotType: BallotType;
  round: number;
} | null;

export function computeYesNoResult(
  voteSessionId: string,
  session: YesNoSessionInput,
  counts: ChoiceCounts,
): VoteResult {
  let { yes, no } = counts;
  const majority = session?.requiredMajority ?? MajorityType.SIMPLE;
  const rdrTiebreakerUsed = session?.rdrTiebreakerUsed ?? false;

  const isSecret = session?.votingMethod === VotingMethod.SECRET;

  if (rdrTiebreakerUsed && session?.rdrTiebreakerChoice) {
    if (!isSecret) {
      if (session.rdrTiebreakerChoice === VoteChoice.YES) yes++;
      else if (session.rdrTiebreakerChoice === VoteChoice.NO) no++;
    }
  }

  const isTied = yes === no && !rdrTiebreakerUsed;
  const votesForMajority = yes + no;
  let approved: boolean | null = null;

  const eligibleCount = session?.eligibleClubCount ?? votesForMajority;

  if (rdrTiebreakerUsed && session?.rdrTiebreakerChoice) {
    approved = session.rdrTiebreakerChoice === VoteChoice.YES;
  } else if (!isTied && votesForMajority > 0) {
    switch (majority) {
      case MajorityType.SIMPLE:
        approved = yes > no;
        break;
      case MajorityType.ABSOLUTE:
        approved = yes > eligibleCount / 2;
        break;
      case MajorityType.TWO_THIRDS:
        approved = yes >= (eligibleCount * 2) / 3;
        break;
      case MajorityType.THREE_QUARTERS:
        approved = yes >= (eligibleCount * 3) / 4;
        break;
    }
  }

  return {
    voteSessionId,
    yes,
    no,
    abstain: counts.abstain,
    total: counts.total,
    eligibleClubCount: session?.eligibleClubCount ?? null,
    approved,
    requiredMajority: majority,
    isTied,
    rdrTiebreakerUsed,
    ballotType: session?.ballotType ?? BallotType.YES_NO,
    round: session?.round ?? 1,
  };
}

export function candidateMeetsThreshold(votes: number, total: number, majority: MajorityType): boolean {
  switch (majority) {
    case MajorityType.SIMPLE:
      return true;
    case MajorityType.ABSOLUTE:
      return votes > total / 2;
    case MajorityType.TWO_THIRDS:
      return votes >= (total * 2) / 3;
    case MajorityType.THREE_QUARTERS:
      return votes >= (total * 3) / 4;
  }
}

export type CandidateSessionInput = {
  candidates: { id: string; displayName: string; userId: string | null }[];
  eligibleClubCount: number | null;
  requiredMajority: MajorityType;
  rdrTiebreakerUsed: boolean;
  rdrTiebreakerCandidateId: string | null;
  votingMethod: VotingMethod;
  round: number;
};

/** `voteCounts`: YES votes per candidate (legacy groupBy on candidateId). */
export function computeCandidateResult(
  session: CandidateSessionInput,
  voteCounts: { candidateId: string | null; count: number }[],
): CandidateVoteResult {
  const eligibleCount = session.eligibleClubCount ?? 0;
  const totalVotes = voteCounts.reduce((sum, v) => sum + v.count, 0);
  const majority = session.requiredMajority;

  const candidateResults: CandidateResult[] = session.candidates
    .map((c) => {
      const count = voteCounts.find((v) => v.candidateId === c.id)?.count ?? 0;
      return {
        candidateId: c.id,
        displayName: c.displayName,
        userId: c.userId,
        votes: count,
        pct: totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0,
      };
    })
    .sort((a, b) => b.votes - a.votes);

  const top = candidateResults[0];
  const second = candidateResults[1];
  const threshold = eligibleCount > 0 ? eligibleCount : totalVotes;

  // Check for RDR tiebreaker candidate
  if (session.rdrTiebreakerUsed && session.rdrTiebreakerCandidateId) {
    const winner = candidateResults.find((c) => c.candidateId === session.rdrTiebreakerCandidateId) ?? null;
    const isSecret = session.votingMethod === VotingMethod.SECRET;
    return {
      candidateResults,
      winner,
      needsRunoff: false,
      runoffCandidates: [],
      isTied: false,
      totalVotes,
      eligibleCount,
      rdrTiebreakerUsed: true,
      rdrTiebreakerCandidateId: isSecret ? null : session.rdrTiebreakerCandidateId,
    };
  }

  const isTied = !!(top && second && top.votes === second.votes && top.votes > 0);
  const meetsThreshold = top && top.votes > 0 && candidateMeetsThreshold(top.votes, threshold || top.votes, majority);

  let winner: CandidateResult | null = null;
  let needsRunoff = false;
  let runoffCandidates: CandidateResult[] = [];

  if (!isTied && meetsThreshold) {
    winner = top;
  } else if (candidateResults.length > 1 && session.round <= 1) {
    needsRunoff = true;
    runoffCandidates = [top, second].filter((c): c is CandidateResult => !!c);
  } else if (session.round > 1 && !isTied) {
    // Second round: simple majority between top 2 is enough
    winner = top ?? null;
  }

  return {
    candidateResults,
    winner,
    needsRunoff,
    runoffCandidates,
    isTied,
    totalVotes,
    eligibleCount,
    rdrTiebreakerUsed: session.rdrTiebreakerUsed,
    rdrTiebreakerCandidateId: session.rdrTiebreakerCandidateId,
  };
}

/** Same masking the legacy snapshot applies to an OPEN SECRET session. */
export function maskSecretResult<T extends VoteResult & { candidateResult?: CandidateVoteResult | null }>(res: T) {
  return {
    voteSessionId: res.voteSessionId,
    yes: 0,
    no: 0,
    abstain: 0,
    total: res.total,
    approved: null,
    isTied: null,
    requiredMajority: res.requiredMajority,
    ballotType: res.ballotType,
    round: res.round,
    candidateResult: null,
  };
}
