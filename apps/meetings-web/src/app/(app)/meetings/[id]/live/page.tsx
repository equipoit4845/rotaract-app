'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useMeetingRoom } from '@/hooks/useMeetingRoom';
import { useAuthState } from '@/context/AuthContext';
import { VoteActionPanel } from '@/components/VoteActionPanel';
import { VoteResultSummary } from '@/components/VoteResultSummary';
import { CurrentTopicCard } from '@/components/CurrentTopicCard';
import { SpeakingQueueList } from '@/components/SpeakingQueueList';
import { RequestToSpeakButton } from '@/components/RequestToSpeakButton';
import { QuorumIndicator } from '@/components/meetings/QuorumIndicator';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { cn } from '@/lib/utils';
import { motionsApi, votingApi } from '@/lib/api';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { LiveTranscriber } from '@/components/meetings/LiveTranscriber';
import { TakeFloorControl } from '@/components/meetings/TakeFloorControl';

export default function ParticipantLivePage() {
  const params = useParams();
  const meetingId = params.id as string;
  const { snapshot, voteResult, connected, joinError } = useMeetingRoom(meetingId);
  const { user } = useAuthState();

  const [proposeDialogOpen, setProposeDialogOpen] = useState(false);
  const [motionTitle, setMotionTitle] = useState('');
  const [motionDesc, setMotionDesc] = useState('');
  const [submittingMotion, setSubmittingMotion] = useState(false);
  const [secondingMotionId, setSecondingMotionId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const ownRequest =
    user && snapshot?.speakingQueue
      ? snapshot.speakingQueue.find((req) => req.userId === user.id)
      : null;
  const isRequested = !!ownRequest;
  const requestId = ownRequest?.id;

  async function handleProposeMotion(e: React.FormEvent) {
    e.preventDefault();
    if (!motionTitle.trim()) {
      toast.error('La moción debe tener un título.');
      return;
    }
    setSubmittingMotion(true);
    try {
      await motionsApi.propose(meetingId, motionTitle.trim(), motionDesc.trim() || undefined);
      toast.success('Moción propuesta con éxito.');
      setProposeDialogOpen(false);
      setMotionTitle('');
      setMotionDesc('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al proponer moción');
    } finally {
      setSubmittingMotion(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {snapshot && (
        <LiveTranscriber
          meetingId={meetingId}
          currentSpeakerId={snapshot.currentSpeaker?.id}
          currentTopicId={snapshot.currentTopicId}
          transcriptionEnabled={snapshot.meeting?.transcriptionEnabled ?? true}
        />
      )}
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/meetings/${meetingId}`}>← Volver</Link>
          </Button>
          <h1 className="text-lg font-semibold">Sala en vivo</h1>
          {snapshot && <StatusBadge status={snapshot.status} />}
        </div>
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'size-2 rounded-full',
              connected ? 'bg-success animate-pulse' : 'bg-destructive',
            )}
          />
          <span className="text-xs text-muted-foreground">
            {connected ? 'Conectado' : 'Desconectado'}
          </span>
        </div>
      </div>

      {joinError && (
        <Card className="border-destructive">
          <CardContent className="p-4">
            <p className="text-sm text-destructive font-medium">{joinError}</p>
          </CardContent>
        </Card>
      )}

      {/* Loading skeleton */}
      {!snapshot && !joinError && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-48 w-full rounded-xl" />
          </div>
          <div>
            <Skeleton className="h-72 w-full rounded-xl" />
          </div>
        </div>
      )}

      {snapshot && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Main Area (Left Column) */}
          <div className="space-y-6 lg:col-span-2">
            {/* Quorum indicator */}
            {snapshot.quorum && (
              <QuorumIndicator
                required={snapshot.quorum.required}
                present={snapshot.quorum.present}
                met={snapshot.quorum.met}
                isInformationalOnly={snapshot.quorum.isInformationalOnly}
              />
            )}

            {/* Current topic */}
            <CurrentTopicCard
              topic={snapshot.currentTopic ?? { title: '—' }}
              timer={snapshot.activeTimer ?? null}
              topics={snapshot.topics}
              currentTopicId={snapshot.currentTopicId}
            />

            {/* Active vote */}
            {snapshot.activeVoteSession && (
              <VoteActionPanel
                meetingId={meetingId}
                voteSessionId={snapshot.activeVoteSession.id}
                topicTitle={snapshot.activeVoteSession.topicTitle}
                ballotType={snapshot.activeVoteSession.ballotType ?? 'YES_NO'}
                candidates={snapshot.activeVoteSession.candidates ?? []}
                initialVote={snapshot.ownVote}
              />
            )}

            {/* Request to speak */}
            {(snapshot.status === 'LIVE' || snapshot.status === 'PAUSED') && (
              <RequestToSpeakButton
                meetingId={meetingId}
                isRequested={isRequested}
                requestId={requestId}
              />
            )}

            {/* RDR Tiebreaker Panel (Visible only to RDR when there is a tie) */}
            {user?.role === 'RDR' && voteResult && !snapshot.activeVoteSession && voteResult.isTied && !voteResult.rdrTiebreakerUsed && (
              <Card className="border-warning/40 bg-warning/5">
                <CardContent className="pt-6 space-y-3">
                  <div>
                    <h3 className="font-semibold text-warning-foreground text-sm flex items-center gap-1.5">
                      ⚠️ Desempate RDR Requerido (Art. 49)
                    </h3>
                    <p className="text-xs text-muted-foreground">La votación resultó en un empate. Tu voto decidirá el resultado final.</p>
                  </div>
                  
                  {voteResult.ballotType === 'CANDIDATE' && voteResult.candidateResult ? (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold">Selecciona al candidato ganador:</p>
                      <div className="space-y-1.5">
                        {voteResult.candidateResult.candidateResults
                          .filter((c) => c.votes === voteResult.candidateResult!.candidateResults[0]?.votes)
                          .map((c) => (
                            <button
                              key={c.candidateId}
                              disabled={actionLoading}
                              onClick={async () => {
                                setActionLoading(true);
                                try {
                                  await votingApi.rdrCandidateTiebreaker(meetingId, voteResult.voteSessionId, c.candidateId);
                                  toast.success('Desempate aplicado.');
                                } catch (err) {
                                  toast.error(err instanceof Error ? err.message : 'Error');
                                } finally {
                                  setActionLoading(false);
                                }
                              }}
                              className="w-full text-left rounded-lg p-3 text-xs border border-border bg-card hover:bg-muted font-medium transition-colors"
                            >
                              🏆 {c.displayName} ({c.votes} votos)
                            </button>
                          ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={actionLoading}
                        onClick={async () => {
                          setActionLoading(true);
                          try {
                            await votingApi.rdrTiebreaker(meetingId, voteResult.voteSessionId, 'YES');
                            toast.success('Desempate aplicado: A favor.');
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : 'Error');
                          } finally {
                            setActionLoading(false);
                          }
                        }}
                        className="bg-success hover:bg-success/90 border-success text-white"
                      >
                        A favor
                      </Button>
                      <Button
                        size="sm"
                        disabled={actionLoading}
                        onClick={async () => {
                          setActionLoading(true);
                          try {
                            await votingApi.rdrTiebreaker(meetingId, voteResult.voteSessionId, 'NO');
                            toast.success('Desempate aplicado: En contra.');
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : 'Error');
                          } finally {
                            setActionLoading(false);
                          }
                        }}
                        className="bg-destructive hover:bg-destructive/90 border-destructive text-white"
                      >
                        En contra
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Motions Section */}
            {snapshot.motions && (
              <Card className="border-border bg-card">
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <h3 className="font-semibold text-base">Mociones de la Sala</h3>
                      <p className="text-xs text-muted-foreground">Deben ser secundadas por otro club para ir a votación.</p>
                    </div>
                    {(snapshot.status === 'LIVE' || snapshot.status === 'PAUSED') && (
                      <Button onClick={() => setProposeDialogOpen(true)} size="sm">
                        ＋ Proponer Moción
                      </Button>
                    )}
                  </div>

                  {snapshot.motions.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4 bg-muted/5 rounded-lg border border-dashed">
                      No hay mociones propuestas.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {snapshot.motions.map((m) => {
                        const isProposed = m.status === 'PROPOSED';
                        const isSeconded = m.status === 'SECONDED';
                        const isVoting = m.status === 'VOTING';
                        const isApproved = m.status === 'APPROVED';
                        const isRejected = m.status === 'REJECTED';
                        
                        return (
                          <div key={m.id} className="rounded-lg border border-border p-3 space-y-2 bg-muted/10">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <h4 className="font-semibold text-xs text-foreground truncate">{m.title}</h4>
                                {m.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{m.description}</p>}
                                <p className="text-[10px] text-muted-foreground mt-1.5">
                                  Propone: <span className="font-semibold">{m.proposedByClubName}</span>
                                  {m.secondedByClubName && (
                                    <> • Secunda: <span className="font-semibold">{m.secondedByClubName}</span></>
                                  )}
                                </p>
                              </div>
                              <Badge
                                className="shrink-0 text-[10px] px-1.5 py-0.5"
                                variant={
                                  isApproved ? 'success' :
                                  isRejected ? 'destructive' :
                                  isVoting ? 'warning' :
                                  isSeconded ? 'info' : 'outline'
                                }
                              >
                                {isApproved ? 'Aprobada' :
                                 isRejected ? 'Rechazada' :
                                 isVoting ? 'Votando' :
                                 isSeconded ? 'Segundada' : 'Propuesta'}
                              </Badge>
                            </div>

                            {isProposed && (
                              <div className="flex justify-end pt-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={secondingMotionId === m.id}
                                  onClick={async () => {
                                    setSecondingMotionId(m.id);
                                    try {
                                      await motionsApi.second(meetingId, m.id);
                                      toast.success('Moción secundada con éxito.');
                                    } catch (err) {
                                      toast.error(err instanceof Error ? err.message : 'Error al secundar');
                                    } finally {
                                      setSecondingMotionId(null);
                                    }
                                  }}
                                  className="h-7 px-2.5 text-[11px]"
                                >
                                  {secondingMotionId === m.id ? 'Segundando...' : '✋ Secundar'}
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Take floor control (visible solo para RDR/Secretario) */}
            <TakeFloorControl
              meetingId={meetingId}
              currentSpeaker={snapshot.currentSpeaker}
              currentTopicId={snapshot.currentTopicId}
            />

            {/* Speaking queue */}
            <SpeakingQueueList
              items={snapshot.speakingQueue ?? []}
              currentSpeaker={snapshot.currentSpeaker}
              nextSpeaker={snapshot.nextSpeaker}
            />

            {/* Vote results */}
            {voteResult && !snapshot.activeVoteSession && (
              <VoteResultSummary
                yes={voteResult.yes}
                no={voteResult.no}
                abstain={voteResult.abstain}
                total={voteResult.total}
                approved={voteResult.approved}
                isTied={voteResult.isTied}
                requiredMajority={voteResult.requiredMajority}
                ballotType={voteResult.ballotType}
                round={voteResult.round}
                candidateResult={voteResult.candidateResult}
                rdrTiebreakerUsed={voteResult.rdrTiebreakerUsed}
              />
            )}
          </div>

          {/* Sidebar Area (Right Column) */}
          <div className="space-y-6 lg:col-span-1 lg:sticky lg:top-6 lg:self-start">
            {/* Interactive Agenda */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Orden del Día</h3>
              <div className="rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden">
                <div className="divide-y divide-border">
                  {snapshot.topics.map((t, idx) => {
                    const isCurrent = t.id === snapshot.currentTopicId;
                    const isDone = t.status === 'DONE';
                    const isActive = t.status === 'ACTIVE' || isCurrent;
                    return (
                      <div
                        key={t.id}
                        className={cn(
                          'flex items-center gap-3 px-4 py-3 text-sm transition-colors',
                          isActive ? 'bg-primary/5 border-l-2 border-primary font-medium' : 'bg-transparent',
                          isDone ? 'opacity-60' : '',
                        )}
                      >
                        <span
                          className={cn(
                            'flex size-6 items-center justify-center rounded-full text-xs font-bold shrink-0',
                            isDone ? 'bg-success/20 text-success' :
                            isActive ? 'bg-primary text-primary-foreground' :
                            'bg-muted text-muted-foreground',
                          )}
                        >
                          {isDone ? '✓' : idx + 1}
                        </span>
                        <span className="flex-1 truncate">{t.title}</span>
                        {isActive && (
                          <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-semibold text-primary animate-pulse">
                            Activo
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Attendance indicator */}
            {snapshot.clubAttendance && (() => {
              const clubsToRender = snapshot.clubAttendance;
              if (clubsToRender.length === 0) return null;
              const totalPresent = clubsToRender.filter((c) => c.isPresent).length;
              const connectedPresent = clubsToRender.filter((c) => c.isPresent && c.connected).length;
              return (
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Clubes Presentes</h3>
                  <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-4 space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{connectedPresent} de {totalPresent} conectados</span>
                      {snapshot.attendanceLocked && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">Cerrada</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {clubsToRender.map((c) => (
                        <span
                          key={c.clubId}
                          className={cn(
                            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-all border',
                            c.isYellow
                              ? 'border-warning/30 bg-warning/10 text-warning font-medium'
                              : c.addedAfterLock
                                ? 'border-warning/30 bg-warning/10 text-warning'
                                : c.connected
                                  ? 'border-success/30 bg-success/10 text-success'
                                  : 'border-border bg-muted/30 text-muted-foreground',
                          )}
                        >
                          <span
                            className={cn(
                              'size-1.5 rounded-full',
                              c.isYellow
                                ? 'bg-warning animate-pulse'
                                : c.connected
                                  ? 'bg-success animate-pulse'
                                  : 'bg-muted-foreground/50',
                            )}
                          />
                          {c.clubName}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Propose Motion Dialog */}
      <Dialog open={proposeDialogOpen} onOpenChange={setProposeDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Proponer Moción</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleProposeMotion} className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label htmlFor="title" className="text-xs">Título de la moción</Label>
              <Input
                id="title"
                placeholder="Ej. Aprobar la moción de fondos para..."
                value={motionTitle}
                onChange={(e) => setMotionTitle(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="description" className="text-xs">Descripción (opcional)</Label>
              <Textarea
                id="description"
                placeholder="Explica brevemente de qué se trata la moción..."
                value={motionDesc}
                onChange={(e) => setMotionDesc(e.target.value)}
                rows={3}
              />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setProposeDialogOpen(false)} disabled={submittingMotion}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submittingMotion}>
                {submittingMotion ? 'Enviando...' : 'Proponer Moción'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
