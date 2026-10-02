'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { votingApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { VoteCandidate } from '@/hooks/useMeetingRoom';

type VoteChoice = 'YES' | 'NO' | 'ABSTAIN';

const VOTE_OPTIONS: { choice: VoteChoice; label: string; colors: string; activeRing: string; icon: string }[] = [
  { choice: 'YES', label: 'A favor', colors: 'bg-success/10 border-success/30 hover:bg-success/20 text-success', activeRing: 'ring-2 ring-success', icon: '✓' },
  { choice: 'NO', label: 'En contra', colors: 'bg-destructive/10 border-destructive/30 hover:bg-destructive/20 text-destructive', activeRing: 'ring-2 ring-destructive', icon: '✗' },
  { choice: 'ABSTAIN', label: 'Abstención', colors: 'bg-muted border-border hover:bg-muted/80 text-muted-foreground', activeRing: 'ring-2 ring-border', icon: '—' },
];

export function VoteActionPanel({
  meetingId,
  voteSessionId,
  topicTitle,
  ballotType = 'YES_NO',
  candidates = [],
  initialVote = null,
  onVoted,
}: {
  meetingId: string;
  voteSessionId: string;
  topicTitle: string;
  ballotType?: 'YES_NO' | 'CANDIDATE';
  candidates?: VoteCandidate[];
  initialVote?: { choice: string; candidateId?: string | null; voteSessionId?: string } | null;
  onVoted?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [voted, setVoted] = useState<{ choice: VoteChoice; candidateId?: string } | null>(null);

  useEffect(() => {
    if (initialVote && initialVote.voteSessionId === voteSessionId) {
      setVoted({
        choice: initialVote.choice as VoteChoice,
        candidateId: initialVote.candidateId ?? undefined,
      });
    } else if (initialVote && !('voteSessionId' in initialVote)) {
      // Fallback if voteSessionId is not present in the payload but we know it belongs to the current session
      setVoted({
        choice: initialVote.choice as VoteChoice,
        candidateId: initialVote.candidateId ?? undefined,
      });
    } else {
      setVoted(null);
    }
  }, [initialVote, voteSessionId]);

  async function submitChoice(choice: VoteChoice, candidateId?: string) {
    setLoading(true);
    try {
      await votingApi.vote(meetingId, voteSessionId, choice, candidateId);
      setVoted({ choice, candidateId });
      toast.success('Voto registrado.');
      onVoted?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al votar.');
    } finally {
      setLoading(false);
    }
  }

  if (ballotType === 'CANDIDATE') {
    const votedCandidate = candidates.find((c) => c.id === voted?.candidateId);
    return (
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Elección: {topicTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {voted ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Tu voto fue registrado.</p>
              {candidates.length === 1 ? (
                <div className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm space-y-1">
                  <p className="font-semibold text-primary">Candidato: {candidates[0]?.displayName}</p>
                  <p className="text-xs text-muted-foreground">
                    Voto: <span className="font-bold uppercase">{voted.choice === 'YES' ? 'A favor' : voted.choice === 'NO' ? 'En contra' : 'Abstención'}</span>
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-semibold text-primary">
                  {voted.choice === 'ABSTAIN' ? 'Voto registrado: Abstención' : `Candidato seleccionado: ${votedCandidate?.displayName ?? voted.candidateId}`}
                </div>
              )}
            </div>
          ) : candidates.length === 1 ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-background p-3 text-center">
                <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Candidato Único</p>
                <h4 className="font-bold text-base text-foreground mt-1">{candidates[0]?.displayName}</h4>
              </div>
              <p className="text-xs text-muted-foreground text-center">Emití tu voto sobre esta opción:</p>
              <div className="grid grid-cols-3 gap-3">
                {VOTE_OPTIONS.map((opt) => (
                  <button
                    key={opt.choice}
                    type="button"
                    disabled={loading}
                    onClick={() => submitChoice(opt.choice, candidates[0].id)}
                    className={cn(
                      'flex flex-col items-center gap-2 rounded-xl border p-4 text-xs font-semibold transition-all active:scale-95',
                      'cursor-pointer disabled:cursor-wait disabled:opacity-60',
                      opt.colors,
                    )}
                  >
                    <span className="text-2xl">{opt.icon}</span>
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground mb-1">Seleccioná un candidato o abstención:</p>
              <div className="space-y-2">
                {candidates.map((c, i) => (
                  <button
                    key={c.id}
                    type="button"
                    disabled={loading}
                    onClick={() => submitChoice('YES', c.id)}
                    className={cn(
                      'w-full flex items-center gap-3 rounded-xl border p-4 text-sm font-medium transition-all active:scale-[0.98] text-left',
                      'bg-muted/30 border-border hover:bg-primary/10 hover:border-primary/40 cursor-pointer disabled:cursor-wait disabled:opacity-60',
                    )}
                  >
                    <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary shrink-0">
                      {String.fromCharCode(65 + i)}
                    </span>
                    <span className="flex-1">{c.displayName}</span>
                  </button>
                ))}
              </div>
              <div className="pt-2 border-t border-border/60">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => submitChoice('ABSTAIN')}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 rounded-xl border p-3 text-xs font-bold transition-all active:scale-[0.98]',
                    'bg-muted border-border hover:bg-muted/80 text-muted-foreground cursor-pointer disabled:cursor-wait disabled:opacity-60',
                  )}
                >
                  <span className="text-base">—</span>
                  <span>Abstención</span>
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Moción: {topicTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        {voted ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Tu voto fue registrado.</p>
            <div className="grid grid-cols-3 gap-3">
              {VOTE_OPTIONS.map((opt) => (
                <button
                  key={opt.choice}
                  disabled
                  aria-pressed={voted.choice === opt.choice}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-xl border p-4 text-sm font-medium transition-all',
                    voted.choice === opt.choice
                      ? cn(opt.colors, opt.activeRing)
                      : 'opacity-30 border-border bg-muted/20 text-muted-foreground',
                  )}
                >
                  <span className="text-2xl">{opt.icon}</span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {VOTE_OPTIONS.map((opt) => (
              <button
                key={opt.choice}
                type="button"
                disabled={loading}
                aria-pressed={false}
                onClick={() => submitChoice(opt.choice)}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-xl border p-4 text-sm font-medium transition-all active:scale-95',
                  'cursor-pointer disabled:cursor-wait disabled:opacity-60',
                  opt.colors,
                )}
              >
                <span className="text-2xl">{opt.icon}</span>
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
