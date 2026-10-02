'use client';

import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '@/lib/config';
import { getToken, invalidateToken } from '@/lib/session-token';

export type VoteCandidate = { id: string; displayName: string; userId: string | null };

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

export type MeetingSnapshot = {
  meetingId: string;
  status: string;
  meetingType?: string;
  isDistrictMeeting?: boolean;
  isInformationalOnly?: boolean;
  attendanceLocked?: boolean;
  meeting?: { transcriptionEnabled?: boolean };
  currentTopicId: string | null;
  currentTopic: { id: string; title: string; type: string } | null;
  topics: { id: string; title: string; order: number; type: string; status: string }[];
  activeVoteSession?: {
    id: string;
    topicId: string;
    topicTitle: string;
    votingMethod?: string;
    requiredMajority?: string;
    ballotType?: 'YES_NO' | 'CANDIDATE';
    electionType?: string | null;
    isElection?: boolean;
    round?: number;
    candidates?: VoteCandidate[];
    eligibleClubCount?: number | null;
    votedClubIds?: string[];
  } | null;
  speakingQueue?: { id: string; userId: string; fullName: string; position: number; status?: string }[];
  currentSpeaker?: { id: string; fullName: string } | null;
  nextSpeaker?: { id: string; fullName: string } | null;
  activeTimer?: {
    id: string;
    type: string;
    topicId?: string;
    plannedDurationSec: number;
    remainingSec: number;
    overtimeSec: number;
  } | null;
  quorum?: {
    required: number;
    present: number;
    met: boolean;
    isInformationalOnly: boolean;
  } | null;
  clubAttendance?: {
    clubId: string;
    clubName: string;
    isPresent?: boolean;
    connected: boolean;
    attendeeUserId: string | null;
    attendeeName: string | null;
    addedAfterLock?: boolean;
    isYellow?: boolean;
  }[];
  ownVote?: {
    voteSessionId: string;
    choice: 'YES' | 'NO' | 'ABSTAIN';
    candidateId?: string | null;
  } | null;
  motions?: {
    id: string;
    meetingId: string;
    title: string;
    description: string | null;
    status: 'PROPOSED' | 'SECONDED' | 'VOTING' | 'APPROVED' | 'REJECTED';
    proposedByClubId: string;
    proposedByClubName: string;
    secondedByClubId: string | null;
    secondedByClubName: string | null;
    voteSessionId: string | null;
    createdAt: string;
  }[];
};

export type VoteResult = {
  voteSessionId: string;
  yes: number;
  no: number;
  abstain: number;
  total: number;
  approved?: boolean | null;
  isTied?: boolean;
  requiredMajority?: string;
  ballotType?: 'YES_NO' | 'CANDIDATE';
  electionType?: string | null;
  round?: number;
  candidateResult?: CandidateVoteResult | null;
  rdrTiebreakerUsed?: boolean;
};

type RawVoteEvent = {
  voteSessionId?: string;
  counts?: { yes: number; no: number; abstain: number };
  total?: number;
  approved?: boolean | null;
  isTied?: boolean;
  requiredMajority?: string;
  ballotType?: 'YES_NO' | 'CANDIDATE';
  electionType?: string | null;
  round?: number;
  candidateResult?: CandidateVoteResult | null;
  rdrTiebreakerUsed?: boolean;
};

function normalizeSnapshot(data: Record<string, unknown>): MeetingSnapshot {
  const meeting = data.meeting as {
    id?: string;
    status?: string;
    type?: string;
    isDistrictMeeting?: boolean;
    isInformationalOnly?: boolean;
    attendanceLocked?: boolean;
    transcriptionEnabled?: boolean;
  } | undefined;
  const activeVote = data.activeVote as {
    voteSessionId?: string;
    topicId?: string;
    topicTitle?: string;
    votingMethod?: string;
    requiredMajority?: string;
    ballotType?: 'YES_NO' | 'CANDIDATE';
    electionType?: string | null;
    isElection?: boolean;
    round?: number;
    candidates?: VoteCandidate[];
    eligibleClubCount?: number | null;
    votedClubIds?: string[];
  } | undefined;
  const quorum = data.quorum as MeetingSnapshot['quorum'] ?? null;
  const timers = (data.timers as Array<{ id: string; type: string; topicId?: string; plannedDurationSec: number; elapsedSec?: number }>) ?? [];
  const firstTimer = timers[0];
  const ownVote = data.ownVote as MeetingSnapshot['ownVote'] ?? null;
  return {
    meetingId: meeting?.id ?? '',
    status: meeting?.status ?? '',
    meetingType: meeting?.type,
    isDistrictMeeting: meeting?.isDistrictMeeting,
    isInformationalOnly: meeting?.isInformationalOnly,
    attendanceLocked: meeting?.attendanceLocked,
    meeting: { transcriptionEnabled: meeting?.transcriptionEnabled ?? true },
    currentTopicId: (data.currentTopic as { id?: string })?.id ?? null,
    currentTopic: data.currentTopic as MeetingSnapshot['currentTopic'],
    topics: (data.topics as MeetingSnapshot['topics']) ?? [],
    activeVoteSession: activeVote
      ? {
          id: activeVote.voteSessionId ?? '',
          topicId: activeVote.topicId ?? '',
          topicTitle: activeVote.topicTitle ?? '',
          votingMethod: activeVote.votingMethod,
          requiredMajority: activeVote.requiredMajority,
          ballotType: activeVote.ballotType,
          electionType: activeVote.electionType,
          isElection: activeVote.isElection,
          round: activeVote.round,
          candidates: activeVote.candidates ?? [],
          eligibleClubCount: activeVote.eligibleClubCount,
          votedClubIds: activeVote.votedClubIds ?? [],
        }
      : null,
    quorum,
    speakingQueue: ((data.speakingQueue as Array<{ id: string; userId: string; fullName?: string; user?: { fullName?: string }; position: number; status?: string }>) ?? []).map((r) => ({
      id: r.id,
      userId: r.userId,
      fullName: r.fullName ?? r.user?.fullName ?? '—',
      position: r.position,
      status: r.status,
    })),
    currentSpeaker: data.currentSpeaker as MeetingSnapshot['currentSpeaker'],
    nextSpeaker: data.nextSpeaker as MeetingSnapshot['nextSpeaker'],
    activeTimer: firstTimer
      ? {
          id: firstTimer.id,
          type: firstTimer.type,
          // Legacy dropped topicId here, so the admin "Detener cronómetro"
          // button (shown only when activeTimer.topicId === currentTopic.id) never appeared.
          topicId: firstTimer.topicId,
          plannedDurationSec: firstTimer.plannedDurationSec,
          remainingSec: Math.max(0, firstTimer.plannedDurationSec - (firstTimer.elapsedSec ?? 0)),
          overtimeSec: Math.max(0, (firstTimer.elapsedSec ?? 0) - firstTimer.plannedDurationSec),
        }
      : null,
    clubAttendance: (data.clubAttendance as MeetingSnapshot['clubAttendance']) ?? [],
    ownVote,
    motions: (data.motions as MeetingSnapshot['motions']) ?? [],
  };
}

/** Token rejected by meetings-api (expired, invalid, missing). */
export function isAuthError(message: string | undefined | null): boolean {
  if (!message) return false;
  return /unauthori[sz]ed|no autenticado|invalid[_ ]token|jwt expired|token expirado/i.test(message);
}

function joinMeetingWithAck(
  s: Socket,
  meetingId: string,
  setSnapshot: (data: MeetingSnapshot | null) => void,
  setVoteResult: (data: VoteResult | null) => void,
  setJoinError: (msg: string | null) => void,
  onAuthError?: () => void,
) {
  s.emit(
    'meeting.join',
    { meetingId },
    (res: { event?: string; data?: unknown } | undefined) => {
      if (!res) return;
      if (res.event === 'meeting.snapshot' && res.data && typeof res.data === 'object') {
        const payload = res.data as Record<string, unknown>;
        setSnapshot(normalizeSnapshot(payload));
        if (payload.voteResult) {
          setVoteResult(payload.voteResult as VoteResult);
        } else {
          setVoteResult(null);
        }
        setJoinError(null);
      }
      if (res.event === 'error') {
        const msg = res.data && typeof res.data === 'object' && 'message' in res.data ? String((res.data as { message: unknown }).message) : 'Error al unirse';
        if (onAuthError && isAuthError(msg)) {
          onAuthError();
          return;
        }
        setJoinError(msg);
      }
    },
  );
}

export function useMeetingRoom(meetingId: string | null) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [snapshot, setSnapshot] = useState<MeetingSnapshot | null>(null);
  const [voteResult, setVoteResult] = useState<VoteResult | null>(null);
  const [connected, setConnected] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    if (!meetingId) return;
    let disposed = false;
    // `auth` as a callback is re-evaluated on every (re)connection, so a
    // reconnect after the 15-minute token expired sends a fresh one.
    const options = {
      auth: (cb: (data: object) => void) => {
        getToken()
          .then((token) => cb({ token }))
          .catch(() => cb({}));
      },
      transports: ['websocket', 'polling'],
    };
    const s = SOCKET_URL ? io(SOCKET_URL, options) : io(options);
    setSocket(s);
    let authRetries = 0;
    const refreshAndReconnect = () => {
      if (disposed || authRetries >= 3) return;
      authRetries += 1;
      invalidateToken();
      getToken({ force: true })
        .then(() => {
          if (disposed) return;
          if (s.connected) {
            joinMeetingWithAck(s, meetingId, setSnapshot, setVoteResult, setJoinError, refreshAndReconnect);
          } else {
            s.connect();
          }
        })
        .catch(() => {});
    };
    s.on('connect', () => {
      setConnected(true);
      setJoinError(null);
      joinMeetingWithAck(s, meetingId, setSnapshot, setVoteResult, setJoinError, refreshAndReconnect);
    });
    // A handshake rejected by the server middleware is not retried by
    // socket.io: mint a new token and connect again.
    s.on('connect_error', (err: Error) => {
      if (isAuthError(err?.message)) refreshAndReconnect();
    });
    s.on('disconnect', () => setConnected(false));
    s.on('meeting.snapshot', (data: Record<string, unknown>) => {
      authRetries = 0;
      setSnapshot(normalizeSnapshot(data));
      if (data.voteResult) {
        setVoteResult(data.voteResult as VoteResult);
      } else {
        setVoteResult(null);
      }
      setJoinError(null);
    });
    s.on('meeting.vote.closed', (data: RawVoteEvent) => {
      if (data.voteSessionId) {
        setVoteResult({
          voteSessionId: data.voteSessionId,
          yes: data.counts?.yes ?? 0,
          no: data.counts?.no ?? 0,
          abstain: data.counts?.abstain ?? 0,
          total: data.total ?? 0,
          approved: data.approved,
          isTied: data.isTied,
          requiredMajority: data.requiredMajority,
          ballotType: data.ballotType,
          electionType: data.electionType,
          round: data.round,
          candidateResult: data.candidateResult,
          rdrTiebreakerUsed: data.rdrTiebreakerUsed,
        });
      }
    });
    s.on('meeting.vote.result', (data: RawVoteEvent) => {
      if (data.voteSessionId) {
        setVoteResult({
          voteSessionId: data.voteSessionId,
          yes: data.counts?.yes ?? 0,
          no: data.counts?.no ?? 0,
          abstain: data.counts?.abstain ?? 0,
          total: data.total ?? 0,
          approved: data.approved,
          isTied: data.isTied,
          requiredMajority: data.requiredMajority,
          ballotType: data.ballotType,
          electionType: data.electionType,
          round: data.round,
          candidateResult: data.candidateResult,
          rdrTiebreakerUsed: data.rdrTiebreakerUsed,
        });
      }
    });
    s.on('error', (data: { message?: string }) => {
      setJoinError(data?.message ?? 'Error de conexión');
    });
    return () => {
      disposed = true;
      s.emit('leave_meeting', { meetingId });
      s.disconnect();
      setSocket(null);
      setSnapshot(null);
      setVoteResult(null);
      setConnected(false);
      setJoinError(null);
    };
  }, [meetingId]);

  return { socket, snapshot, voteResult, connected, joinError };
}
