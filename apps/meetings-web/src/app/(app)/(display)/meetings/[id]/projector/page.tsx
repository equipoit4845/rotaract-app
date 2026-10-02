'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useMeetingRoom } from '@/hooks/useMeetingRoom';
import { TimerDisplay } from '@/components/TimerDisplay';
import { Button } from '@/components/ui/button';
import { Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MEETING_TYPE_LABELS, MAJORITY_TYPE_LABELS } from '@/lib/meeting-constants';

function playChimeSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    
    // First tone (D5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, ctx.currentTime);
    gain1.gain.setValueAtTime(0.12, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.35);
    
    // Second tone (A5)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, ctx.currentTime + 0.12);
    gain2.gain.setValueAtTime(0.12, ctx.currentTime + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.47);
    
    osc2.start(ctx.currentTime + 0.12);
    osc2.stop(ctx.currentTime + 0.47);
  } catch (err) {
    console.error('Failed to play chime sound:', err);
  }
}

export default function ProjectorPage() {
  const params = useParams();
  const meetingId = params.id as string;
  const { snapshot, voteResult, connected } = useMeetingRoom(meetingId);

  const [soundEnabled, setSoundEnabled] = useState(true);
  const [prevQueueIds, setPrevQueueIds] = useState<string[]>([]);
  const isInitialized = useRef(false);

  useEffect(() => {
    if (!snapshot?.speakingQueue) return;
    
    const currentQueueIds = snapshot.speakingQueue.map((item) => item.id);
    
    if (!isInitialized.current) {
      setPrevQueueIds(currentQueueIds);
      isInitialized.current = true;
      return;
    }
    
    const hasNewRequest = currentQueueIds.some((id) => !prevQueueIds.includes(id));
    if (hasNewRequest && soundEnabled) {
      playChimeSound();
    }
    
    setPrevQueueIds(currentQueueIds);
  }, [snapshot?.speakingQueue, prevQueueIds, soundEnabled]);

  const quorum = snapshot?.quorum;
  const clubs = snapshot?.clubAttendance ?? [];
  const votingBaseClubs = clubs.filter((c) => c.isPresent);
  const connectedVotingClubs = votingBaseClubs.filter((c) => c.connected);
  const disconnectedVotingClubs = votingBaseClubs.filter((c) => !c.connected);
  const yellowClubs = clubs.filter((c) => !c.isPresent && c.connected);
  const hasActiveVote = !!snapshot?.activeVoteSession;
  const hasVoteResult = !!voteResult && !hasActiveVote;
  const typeLabel = snapshot?.meetingType ? MEETING_TYPE_LABELS[snapshot.meetingType] ?? snapshot.meetingType : '';

  return (
    <div className="dark min-h-screen bg-background text-foreground flex flex-col">
      {/* Top bar: status + quorum */}
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-4">
          {snapshot && (
            <>
              <span className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold',
                snapshot.status === 'LIVE' ? 'bg-success/20 text-success' :
                snapshot.status === 'PAUSED' ? 'bg-warning/20 text-warning' :
                'bg-muted text-muted-foreground',
              )}>
                {snapshot.status === 'LIVE' && <span className="size-2 rounded-full bg-success animate-pulse" />}
                {snapshot.status}
              </span>
              {typeLabel && (
                <span className="text-xs text-muted-foreground">{typeLabel}</span>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-4">
          {/* Quorum indicator */}
          {quorum && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Quórum:</span>
              <span className={cn(
                'text-sm font-semibold tabular-nums',
                quorum.met ? 'text-success' : 'text-warning',
              )}>
                {quorum.present}/{quorum.required}
              </span>
              <span className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
                quorum.met ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning',
              )}>
                {quorum.met ? '✓' : '✗'}
              </span>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="h-8 w-8 text-muted-foreground hover:text-foreground border border-border/30 hover:bg-muted/50 rounded-lg"
            title={soundEnabled ? 'Silenciar sonido' : 'Activar sonido'}
          >
            {soundEnabled ? <Volume2 className="h-4 w-4 text-success" /> : <VolumeX className="h-4 w-4 text-destructive animate-pulse" />}
          </Button>

          <div className="flex items-center gap-1.5">
            <div className={cn('size-2 rounded-full', connected ? 'bg-success animate-pulse' : 'bg-destructive')} />
            <span className="text-xs text-muted-foreground">{connected ? 'Conectado' : 'Reconectando...'}</span>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
        {!connected && !snapshot && (
          <p className="text-lg text-muted-foreground animate-pulse">Conectando...</p>
        )}

        {snapshot && !hasActiveVote && !hasVoteResult && (
          <>
            {/* Current topic */}
            <div className="text-center space-y-3 transition-all duration-500">
              <p className="text-sm uppercase tracking-widest text-muted-foreground">
                Tema actual
              </p>
              <h1 className="text-[clamp(1.5rem,5vw,3.5rem)] font-bold leading-tight">
                {snapshot.currentTopic?.title ?? '—'}
              </h1>
            </div>

            {/* Timer */}
            {snapshot.activeTimer && (
              <TimerDisplay
                remainingSec={snapshot.activeTimer.remainingSec}
                overtimeSec={snapshot.activeTimer.overtimeSec}
                plannedDurationSec={snapshot.activeTimer.plannedDurationSec}
                size="lg"
              />
            )}

            {/* Current speaker */}
            {snapshot.currentSpeaker && (
              <div className="text-center space-y-1">
                <p className="text-xs uppercase tracking-widest text-muted-foreground">Orador</p>
                <p className="text-[clamp(1rem,3vw,2rem)] font-semibold">
                  {snapshot.currentSpeaker.fullName}
                </p>
              </div>
            )}

            {/* Speaking Queue (Cola de Oradores) */}
            {snapshot.speakingQueue && snapshot.speakingQueue.length > 0 && (
              <div className="w-full max-w-xl space-y-3 pt-6 border-t border-border/40 mt-4">
                <p className="text-xs uppercase tracking-widest text-muted-foreground text-center">Cola de oradores</p>
                <div className="flex flex-col gap-2 max-h-60 overflow-y-auto pr-1">
                  {snapshot.speakingQueue
                    .sort((a, b) => a.position - b.position)
                    .map((item, idx) => {
                      const isCurrent = snapshot.currentSpeaker?.id === item.userId;
                      const isNext = snapshot.nextSpeaker?.id === item.userId;
                      return (
                        <div
                          key={item.id}
                          className={cn(
                            "flex items-center justify-between rounded-xl px-4 py-2 border text-left transition-all duration-300",
                            isCurrent
                              ? "border-primary bg-primary/10 text-primary scale-105 font-bold shadow-md shadow-primary/5"
                              : isNext
                              ? "border-accent/50 bg-accent/10 text-accent font-semibold"
                              : "border-border bg-muted/20"
                          )}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span
                              className={cn(
                                "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                                isCurrent
                                  ? "bg-primary text-primary-foreground"
                                  : isNext
                                  ? "bg-accent text-accent-foreground"
                                  : "bg-muted text-muted-foreground"
                              )}
                            >
                              {idx + 1}
                            </span>
                            <span className="text-sm truncate">{item.fullName}</span>
                          </div>
                          {isCurrent ? (
                            <span className="text-[10px] font-bold bg-primary/20 text-primary px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse">Hablando</span>
                          ) : isNext ? (
                            <span className="text-[10px] font-bold bg-accent/20 text-accent px-2 py-0.5 rounded-full uppercase tracking-wider">Siguiente</span>
                          ) : null}
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </>
        )}

        {/* Active vote: big display */}
        {snapshot && hasActiveVote && (
          <div className="w-full max-w-3xl space-y-6 text-center">
            <div className="rounded-2xl border-2 border-primary/50 bg-primary/5 p-8 space-y-4 animate-pulse">
              <p className="text-sm uppercase tracking-widest text-muted-foreground">
                {snapshot.activeVoteSession!.electionType === 'RDR'
                  ? 'Elección del Representante Distrital (RDR)'
                  : snapshot.activeVoteSession!.electionType === 'EVENT'
                  ? 'Elección de Sede de Evento Distrital'
                  : snapshot.activeVoteSession!.ballotType === 'CANDIDATE'
                  ? 'Elección abierta'
                  : 'Votación abierta'}
                {(snapshot.activeVoteSession!.round ?? 1) > 1 ? ` — Ronda ${snapshot.activeVoteSession!.round}` : ''}
              </p>
              <h1 className="text-[clamp(1.5rem,4vw,3rem)] font-bold">
                {snapshot.activeVoteSession!.topicTitle}
              </h1>
              {snapshot.activeVoteSession!.ballotType === 'CANDIDATE' && (snapshot.activeVoteSession!.candidates?.length ?? 0) > 0 ? (
                <div className="flex flex-wrap justify-center gap-3">
                  {snapshot.activeVoteSession!.candidates!.map((c, i) => (
                    <span key={c.id} className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm font-medium">
                      <span className="text-xs font-bold text-primary">{String.fromCharCode(65 + i)}</span>
                      {c.displayName}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="flex justify-center gap-4 text-sm text-muted-foreground">
                  <span>{snapshot.activeVoteSession!.votingMethod === 'SECRET' ? 'Secreta' : 'Pública'}</span>
                  <span>•</span>
                  <span>{MAJORITY_TYPE_LABELS[snapshot.activeVoteSession!.requiredMajority ?? 'SIMPLE'] ?? 'Mayoría Simple'}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Vote result */}
        {snapshot && hasVoteResult && voteResult && (
          <div className="w-full max-w-3xl space-y-6">
            <p className="text-sm uppercase tracking-widest text-muted-foreground text-center">
              {voteResult.electionType === 'RDR'
                ? 'Resultado: Elección del Representante Distrital (RDR)'
                : voteResult.electionType === 'EVENT'
                ? 'Resultado: Elección de Sede de Evento Distrital'
                : 'Resultado'}
              {(voteResult.round ?? 1) > 1 ? ` — Ronda ${voteResult.round}` : ''}
            </p>

            {/* Candidate election result */}
            {voteResult.ballotType === 'CANDIDATE' && voteResult.candidateResult ? (
              <div className="space-y-4">
                {voteResult.candidateResult.candidateResults.map((c, i) => {
                  const isWinner = voteResult.candidateResult?.winner?.candidateId === c.candidateId;
                  const maxVotes = voteResult.candidateResult!.candidateResults[0]?.votes ?? 1;
                  const barW = maxVotes > 0 ? Math.round((c.votes / maxVotes) * 100) : 0;
                  return (
                    <div key={c.candidateId} className={cn(
                      'rounded-xl p-4 space-y-2 border',
                      isWinner ? 'border-success/50 bg-success/10' : 'border-border bg-muted/20',
                    )}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="flex size-8 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary">
                            {String.fromCharCode(65 + i)}
                          </span>
                          <span className="text-[clamp(1rem,2vw,1.5rem)] font-semibold">{c.displayName}</span>
                          {isWinner && (
                            <span className="rounded-full bg-success/20 px-3 py-1 text-xs font-bold text-success">
                              {voteResult.electionType === 'RDR' ? 'ELECTO' : voteResult.electionType === 'EVENT' ? 'SELECCIONADO' : 'GANADOR'}
                            </span>
                          )}
                        </div>
                        <span className="text-[clamp(1.5rem,3vw,2.5rem)] font-bold tabular-nums">{c.votes}</span>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn('h-full transition-all duration-700', isWinner ? 'bg-success' : 'bg-primary/40')}
                          style={{ width: `${barW}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                <div className="text-center">
                  {voteResult.candidateResult.winner ? (
                    <span className="inline-flex items-center rounded-full bg-success/20 px-6 py-2 text-xl font-bold text-success">
                      {voteResult.electionType === 'RDR'
                        ? `RDR ELECTO: ${voteResult.candidateResult.winner.displayName.toUpperCase()}`
                        : voteResult.electionType === 'EVENT'
                        ? `SEDE ELEGIDA: ${voteResult.candidateResult.winner.displayName.toUpperCase()}`
                        : `GANADOR: ${voteResult.candidateResult.winner.displayName.toUpperCase()}`}
                    </span>
                  ) : voteResult.candidateResult.isTied ? (
                    <span className="inline-flex items-center rounded-full bg-warning/20 px-6 py-2 text-xl font-bold text-warning">
                      EMPATE — Desempate RDR (Art. 49)
                    </span>
                  ) : voteResult.candidateResult.needsRunoff ? (
                    <span className="inline-flex items-center rounded-full bg-info/20 px-6 py-2 text-xl font-bold text-info">
                      SEGUNDA VUELTA (Art. 64i)
                    </span>
                  ) : null}
                </div>
              </div>
            ) : (
              /* YES/NO result */
              <>
                <div className="grid grid-cols-3 gap-6 text-center">
                  <div>
                    <p className="text-[clamp(2rem,5vw,4rem)] font-bold tabular-nums text-success">{voteResult.yes}</p>
                    <p className="text-sm text-muted-foreground">A favor</p>
                  </div>
                  <div>
                    <p className="text-[clamp(2rem,5vw,4rem)] font-bold tabular-nums text-destructive">{voteResult.no}</p>
                    <p className="text-sm text-muted-foreground">En contra</p>
                  </div>
                  <div>
                    <p className="text-[clamp(2rem,5vw,4rem)] font-bold tabular-nums text-muted-foreground">{voteResult.abstain}</p>
                    <p className="text-sm text-muted-foreground">Abstención</p>
                  </div>
                </div>
                {(voteResult.yes + voteResult.no + voteResult.abstain) > 0 && (
                  <div className="flex h-4 overflow-hidden rounded-full bg-muted">
                    {voteResult.yes > 0 && <div className="bg-success transition-all" style={{ width: `${(voteResult.yes / (voteResult.yes + voteResult.no + voteResult.abstain)) * 100}%` }} />}
                    {voteResult.no > 0 && <div className="bg-destructive transition-all" style={{ width: `${(voteResult.no / (voteResult.yes + voteResult.no + voteResult.abstain)) * 100}%` }} />}
                    {voteResult.abstain > 0 && <div className="bg-muted-foreground/30 transition-all" style={{ width: `${(voteResult.abstain / (voteResult.yes + voteResult.no + voteResult.abstain)) * 100}%` }} />}
                  </div>
                )}
                <div className="text-center">
                  {voteResult.approved !== undefined && voteResult.approved !== null ? (
                    <span className={cn(
                      'inline-flex items-center rounded-full px-4 py-2 text-lg font-bold',
                      voteResult.approved ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive',
                    )}>
                      {voteResult.approved ? 'APROBADA' : 'RECHAZADA'}
                    </span>
                  ) : voteResult.isTied ? (
                    <span className="inline-flex items-center rounded-full bg-warning/20 px-4 py-2 text-lg font-bold text-warning">
                      EMPATE — Desempate RDR
                    </span>
                  ) : null}
                </div>
              </>
            )}
          </div>
        )}
      </main>

      {/* Bottom bar: club attendance */}
      {snapshot && clubs.length > 0 && !hasActiveVote && !hasVoteResult && (
        <footer className="border-t border-border px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">
                {snapshot.attendanceLocked ? 'Asistencia cerrada' : 'Clubes presentes'}
              </span>
              {snapshot.attendanceLocked && (
                <span className="inline-flex items-center rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  {connectedVotingClubs.length} papeletas
                </span>
              )}
            </div>
            <span className="text-sm font-semibold tabular-nums">
              {connectedVotingClubs.length} conectados / {votingBaseClubs.length} registrados
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {connectedVotingClubs.map((c) => (
              <span
                key={c.clubId}
                className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-medium text-success"
              >
                <span className="size-1.5 rounded-full bg-success animate-pulse" />
                {c.clubName}
              </span>
            ))}
            {yellowClubs.map((c) => (
              <span
                key={c.clubId}
                className="inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-3 py-1 text-xs font-medium text-warning"
              >
                <span className="size-1.5 rounded-full bg-warning animate-pulse" />
                {c.clubName} (No vota)
              </span>
            ))}
            {disconnectedVotingClubs.map((c) => (
              <span
                key={c.clubId}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-3 py-1 text-xs text-muted-foreground"
              >
                <span className="size-1.5 rounded-full bg-muted-foreground/50" />
                {c.clubName}
              </span>
            ))}
          </div>
        </footer>
      )}
    </div>
  );
}
