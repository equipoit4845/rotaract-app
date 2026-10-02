'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { CandidateVoteResult } from '@/hooks/useMeetingRoom';

type VoteResultSummaryProps = {
  yes: number;
  no: number;
  abstain: number;
  total: number;
  approved?: boolean | null;
  isTied?: boolean;
  requiredMajority?: string;
  eligibleClubCount?: number | null;
  ballotType?: 'YES_NO' | 'CANDIDATE';
  round?: number;
  candidateResult?: CandidateVoteResult | null;
  rdrTiebreakerUsed?: boolean;
  className?: string;
};

const MAJORITY_LABELS: Record<string, string> = {
  SIMPLE: 'Mayoría Simple',
  ABSOLUTE: 'Mayoría Absoluta',
  TWO_THIRDS: 'Dos Tercios',
  THREE_QUARTERS: 'Tres Cuartos',
};

export function VoteResultSummary({
  yes,
  no,
  abstain,
  total,
  approved: approvedProp,
  isTied,
  requiredMajority,
  eligibleClubCount,
  ballotType = 'YES_NO',
  round = 1,
  candidateResult,
  rdrTiebreakerUsed,
  className,
}: VoteResultSummaryProps) {
  const voted = yes + no + abstain;
  const pctYes = voted > 0 ? Math.round((yes / voted) * 100) : 0;
  const pctNo = voted > 0 ? Math.round((no / voted) * 100) : 0;
  const pctAbstain = voted > 0 ? Math.round((abstain / voted) * 100) : 0;
  const approved = approvedProp ?? (voted > 0 ? yes > no : null);

  if (ballotType === 'CANDIDATE' && candidateResult) {
    if (candidateResult.candidateResults.length === 1) {
      return (
        <div className={cn('rounded-xl border border-border bg-card p-4 space-y-4', className)}>
          <div className="flex items-center justify-between">
            <div className="flex flex-col text-left">
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Resultado Referéndum</span>
              <span className="text-sm font-bold text-foreground">{candidateResult.candidateResults[0]?.displayName}</span>
            </div>
            {voted > 0 && approved !== null ? (
              <Badge variant={approved ? 'success' : 'destructive'}>
                {approved ? 'Aprobado' : 'Rechazado'}
              </Badge>
            ) : null}
          </div>

          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-semibold tabular-nums text-success">{yes}</p>
              <p className="text-xs text-muted-foreground">A favor ({pctYes}%)</p>
            </div>
            <div>
              <p className="text-2xl font-semibold tabular-nums text-destructive">{no}</p>
              <p className="text-xs text-muted-foreground">En contra ({pctNo}%)</p>
            </div>
            <div>
              <p className="text-2xl font-semibold tabular-nums text-muted-foreground">{abstain}</p>
              <p className="text-xs text-muted-foreground">Abstención ({pctAbstain}%)</p>
            </div>
          </div>

          {voted > 0 && (
            <div className="flex h-3 overflow-hidden rounded-full bg-muted">
              {pctYes > 0 && <div className="bg-success transition-all duration-500" style={{ width: `${pctYes}%` }} />}
              {pctNo > 0 && <div className="bg-destructive transition-all duration-500" style={{ width: `${pctNo}%` }} />}
              {pctAbstain > 0 && <div className="bg-muted-foreground/30 transition-all duration-500" style={{ width: `${pctAbstain}%` }} />}
            </div>
          )}

          <p className="text-xs text-muted-foreground text-center">
            {eligibleClubCount
              ? `${voted} de ${eligibleClubCount} presentes votaron (${eligibleClubCount > 0 ? Math.round((voted / eligibleClubCount) * 100) : 0}%)`
              : `${voted} de ${total} votaron`}
          </p>
        </div>
      );
    }

    return (
      <CandidateResultSummary
        candidateResult={candidateResult}
        requiredMajority={requiredMajority}
        round={round}
        rdrTiebreakerUsed={rdrTiebreakerUsed}
        className={className}
      />
    );
  }

  return (
    <div className={cn('rounded-xl border border-border bg-card p-4 space-y-4', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-foreground">Resultado</p>
          {requiredMajority && (
            <span className="text-xs text-muted-foreground">({MAJORITY_LABELS[requiredMajority] ?? requiredMajority})</span>
          )}
        </div>
        {isTied ? (
          <Badge variant="warning">Empate — Desempate RDR (Art. 49)</Badge>
        ) : rdrTiebreakerUsed ? (
          <Badge variant="outline" className="text-xs">Desempate RDR aplicado</Badge>
        ) : voted > 0 && approved !== null ? (
          <Badge variant={approved ? 'success' : 'destructive'}>{approved ? 'Aprobada' : 'Rechazada'}</Badge>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-2xl font-semibold tabular-nums text-success">{yes}</p>
          <p className="text-xs text-muted-foreground">A favor ({pctYes}%)</p>
        </div>
        <div>
          <p className="text-2xl font-semibold tabular-nums text-destructive">{no}</p>
          <p className="text-xs text-muted-foreground">En contra ({pctNo}%)</p>
        </div>
        <div>
          <p className="text-2xl font-semibold tabular-nums text-muted-foreground">{abstain}</p>
          <p className="text-xs text-muted-foreground">Abstención ({pctAbstain}%)</p>
        </div>
      </div>

      {voted > 0 && (
        <div className="flex h-3 overflow-hidden rounded-full bg-muted">
          {pctYes > 0 && <div className="bg-success transition-all duration-500" style={{ width: `${pctYes}%` }} />}
          {pctNo > 0 && <div className="bg-destructive transition-all duration-500" style={{ width: `${pctNo}%` }} />}
          {pctAbstain > 0 && <div className="bg-muted-foreground/30 transition-all duration-500" style={{ width: `${pctAbstain}%` }} />}
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center">
        {eligibleClubCount
          ? `${voted} de ${eligibleClubCount} presentes votaron (${eligibleClubCount > 0 ? Math.round((voted / eligibleClubCount) * 100) : 0}%)`
          : `${voted} de ${total} votaron`}
      </p>
    </div>
  );
}

function CandidateResultSummary({
  candidateResult,
  requiredMajority,
  round,
  rdrTiebreakerUsed,
  className,
}: {
  candidateResult: CandidateVoteResult;
  requiredMajority?: string;
  round: number;
  rdrTiebreakerUsed?: boolean;
  className?: string;
}) {
  const { candidateResults, winner, needsRunoff, isTied, totalVotes, eligibleCount } = candidateResult;
  const maxVotes = candidateResults[0]?.votes ?? 0;

  return (
    <div className={cn('rounded-xl border border-border bg-card p-4 space-y-4', className)}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-foreground">
            Elección{round > 1 ? ` — Ronda ${round}` : ''}
          </p>
          {requiredMajority && (
            <span className="text-xs text-muted-foreground">({MAJORITY_LABELS[requiredMajority] ?? requiredMajority})</span>
          )}
        </div>
        {winner ? (
          <Badge variant="success">Ganador: {winner.displayName}</Badge>
        ) : isTied ? (
          <Badge variant="warning">Empate — Desempate RDR (Art. 49)</Badge>
        ) : needsRunoff ? (
          <Badge variant="warning">Segunda Vuelta Requerida (Art. 64i)</Badge>
        ) : rdrTiebreakerUsed ? (
          <Badge variant="outline" className="text-xs">Desempate RDR aplicado</Badge>
        ) : null}
      </div>

      <div className="space-y-2">
        {candidateResults.map((c, i) => {
          const isWinner = winner?.candidateId === c.candidateId;
          const barWidth = maxVotes > 0 ? Math.round((c.votes / maxVotes) * 100) : 0;
          return (
            <div
              key={c.candidateId}
              className={cn(
                'rounded-lg border p-3 space-y-1',
                isWinner
                  ? 'border-success/40 bg-success/10'
                  : 'border-border bg-muted/20',
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="text-sm font-medium">{c.displayName}</span>
                  {isWinner && <Badge variant="success" className="text-xs py-0">Ganador</Badge>}
                </div>
                <span className="text-sm font-semibold tabular-nums">
                  {c.votes} voto{c.votes !== 1 ? 's' : ''} ({c.pct}%)
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn('h-full transition-all duration-500', isWinner ? 'bg-success' : 'bg-primary/40')}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground text-center">
        {totalVotes} voto{totalVotes !== 1 ? 's' : ''} emitido{totalVotes !== 1 ? 's' : ''}
        {eligibleCount > 0 ? ` de ${eligibleCount} habilitados` : ''}
      </p>
    </div>
  );
}
