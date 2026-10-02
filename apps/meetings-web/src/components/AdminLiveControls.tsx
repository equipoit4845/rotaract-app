'use client';

import { useCallback, useState, useEffect } from 'react';
import { votingApi, timersApi, topicsApi, queueApi, meetingsApi, usersApi, clubsApi, motionsApi, districtApi } from '@/lib/api';
import { VoteReadyModal } from '@/components/meetings/VoteReadyModal';
import { VoteResultSummary } from '@/components/VoteResultSummary';
import { TakeFloorControl } from '@/components/meetings/TakeFloorControl';
import { useAuthState } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormSection } from '@/components/ui/form-section';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { VoteResult, CandidateResult } from '@/hooks/useMeetingRoom';

export type Topic = { id: string; title: string; type?: string };
export type Speaker = { id: string; fullName: string };

export type ActiveVoteSession = {
  id: string;
  topicTitle: string;
  ballotType?: 'YES_NO' | 'CANDIDATE';
  isElection?: boolean;
  round?: number;
  candidates?: { id: string; displayName: string }[];
  votingMethod?: string;
  eligibleClubCount?: number | null;
  votedClubIds?: string[];
};

const TIMER_PRESETS = [
  { label: '5 min', value: 300 },
  { label: '10 min', value: 600 },
  { label: '15 min', value: 900 },
];

// ==========================================
// 1. ADMIN ATTENDANCE CONTROL
// ==========================================
type AdminAttendanceControlProps = {
  meetingId: string;
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
  attendanceLocked?: boolean;
  clubsPresent?: number;
  className?: string;
};

export function AdminAttendanceControl({
  meetingId,
  clubAttendance = [],
  attendanceLocked = false,
  className,
}: AdminAttendanceControlProps) {
  const [lockingAttendance, setLockingAttendance] = useState(false);
  const [selectedClub, setSelectedClub] = useState<{
    clubId: string;
    clubName: string;
    isPresent?: boolean;
    connected: boolean;
    attendeeUserId: string | null;
    attendeeName: string | null;
    addedAfterLock?: boolean;
    isYellow?: boolean;
  } | null>(null);

  const [allClubs, setAllClubs] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    clubsApi.list(false)
      .then((res: any) => {
        setAllClubs(res || []);
      })
      .catch((err) => {
        console.error('Error fetching all clubs:', err);
      });
  }, []);

  async function handleLockAttendance() {
    setLockingAttendance(true);
    try {
      await meetingsApi.lockAttendance(meetingId);
      toast.success('Asistencia cerrada.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setLockingAttendance(false);
    }
  }

  const presentCount = clubAttendance.filter((c) => c.isPresent).length;
  const absentOfflineClubs = allClubs.filter(
    (club) => !clubAttendance.some((c) => c.clubId === club.id)
  );

  return (
    <>
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Asistencia y Quórum</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold tabular-nums">
              {presentCount} presentes
            </span>
            {attendanceLocked ? (
              <Badge variant="secondary" className="text-xs">Cerrada</Badge>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                disabled={lockingAttendance}
                onClick={handleLockAttendance}
              >
                {lockingAttendance ? 'Cerrando...' : 'Cerrar asistencia'}
              </Button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto pr-1">
            {clubAttendance.length === 0 && (
              <p className="text-xs text-muted-foreground text-center w-full py-2 bg-muted/20 rounded-md border border-dashed border-border/40">
                Ningún club conectado o presente aún.
              </p>
            )}
            {clubAttendance.map((c) => (
              <button
                key={c.clubId}
                type="button"
                onClick={() => setSelectedClub(c)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] cursor-pointer hover:opacity-80 transition-opacity text-left border',
                  c.isYellow
                    ? 'border-warning/30 bg-warning/10 text-warning font-medium'
                    : c.isPresent
                      ? c.addedAfterLock
                        ? 'border-warning/30 bg-warning/10 text-warning font-medium'
                        : 'border-success/30 bg-success/10 text-success font-medium'
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
              </button>
            ))}
          </div>

          {absentOfflineClubs.length > 0 && (
            <div className="pt-2 border-t border-border/40">
              <Select
                value=""
                onValueChange={(clubId) => {
                  const club = allClubs.find((c) => c.id === clubId);
                  if (club) {
                    setSelectedClub({
                      clubId: club.id,
                      clubName: club.name,
                      isPresent: false,
                      connected: false,
                      attendeeUserId: null,
                      attendeeName: null,
                      addedAfterLock: false,
                      isYellow: false,
                    });
                  }
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Registrar presencia manualmente..." />
                </SelectTrigger>
                <SelectContent>
                  {absentOfflineClubs.map((club) => (
                    <SelectItem key={club.id} value={club.id}>
                      {club.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedClub && (
        <ClubAttendanceDialog
          meetingId={meetingId}
          clubId={selectedClub.clubId}
          clubName={selectedClub.clubName}
          isPresent={selectedClub.isPresent}
          currentAttendeeId={selectedClub.attendeeUserId}
          currentAttendeeName={selectedClub.attendeeName}
          open={!!selectedClub}
          onClose={() => setSelectedClub(null)}
        />
      )}
    </>
  );
}

function ClubAttendanceDialog({
  meetingId,
  clubId,
  clubName,
  isPresent,
  currentAttendeeId,
  currentAttendeeName,
  open,
  onClose,
}: {
  meetingId: string;
  clubId: string;
  clubName: string;
  isPresent?: boolean;
  currentAttendeeId: string | null;
  currentAttendeeName: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState<{ userId: string; fullName: string; email: string }[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    districtApi.clubs
      .get(clubId)
      .then((res: any) => {
        const authorities = res.authorities || [];
        setMembers(authorities);
        if (currentAttendeeId) {
          setSelectedUserId(currentAttendeeId);
        } else if (authorities.length > 0) {
          setSelectedUserId(authorities[0].userId);
        }
      })
      .catch((err) => {
        toast.error('Error al cargar socios del club: ' + err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [open, clubId, currentAttendeeId]);

  const handleSave = async () => {
    if (!selectedUserId) return;
    setLoading(true);
    try {
      await meetingsApi.updateClubRepresentative(meetingId, clubId, selectedUserId);
      toast.success(isPresent ? 'Representante actualizado' : 'Asistencia registrada con éxito');
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar');
    } finally {
      setLoading(false);
    }
  };

  const handleRemovePresence = async () => {
    setLoading(true);
    try {
      await meetingsApi.removeClubAttendance(meetingId, clubId);
      toast.success('El club ha sido quitado de la lista de presentes');
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Error al quitar asistencia');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isPresent ? `Cambiar Representante — ${clubName}` : `Registrar Asistencia — ${clubName}`}
          </DialogTitle>
          <DialogDescription>
            {isPresent
              ? 'Selecciona el socio que representará al club y ejercerá el voto.'
              : 'Registra la presencia del club en la reunión seleccionando su representante.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-3">
          {isPresent && (
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">Representante Actual</label>
              <p className="text-sm text-muted-foreground bg-muted/50 p-2 rounded-md border border-border/40">
                {currentAttendeeName || 'Ninguno asignado'}
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">
              {isPresent ? 'Nuevo Representante' : 'Seleccionar Representante'}
            </label>
            {loading && members.length === 0 ? (
              <div className="animate-pulse h-10 bg-muted rounded-md" />
            ) : (
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un socio..." />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.userId} value={m.userId}>
                      {m.fullName} ({m.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row sm:justify-between gap-2">
          <div className="flex justify-start">
            {isPresent && (
              <Button variant="destructive" onClick={handleRemovePresence} disabled={loading}>
                Quitar de presentes
              </Button>
            )}
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={loading || !selectedUserId}>
              {loading ? 'Guardando...' : isPresent ? 'Asignar' : 'Marcar Presente'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ==========================================
// 2. ADMIN TOPIC CONTROL
// ==========================================
type AdminTopicControlProps = {
  meetingId: string;
  topics: Topic[];
  currentTopicId: string | null;
  currentTopic: Topic | null;
  activeTimer: { id: string; topicId?: string } | null;
  onTopicChanged?: () => void;
  onTimerChanged?: () => void;
  className?: string;
};

export function AdminTopicControl({
  meetingId,
  topics,
  currentTopicId,
  currentTopic,
  activeTimer,
  onTopicChanged,
  onTimerChanged,
  className,
}: AdminTopicControlProps) {
  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [newTopicType, setNewTopicType] = useState('DISCUSSION');
  const [creatingTopic, setCreatingTopic] = useState(false);
  const [timerDuration, setTimerDuration] = useState('300');
  const [startingTimer, setStartingTimer] = useState(false);
  const [stoppingTimer, setStoppingTimer] = useState(false);

  async function handleCreateTopic() {
    if (!newTopicTitle.trim()) {
      toast.error('El título del tema es requerido.');
      return;
    }
    setCreatingTopic(true);
    try {
      await topicsApi.create(meetingId, {
        title: newTopicTitle.trim(),
        type: newTopicType as any,
      });
      toast.success('Tema creado.');
      setNewTopicTitle('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al crear tema.');
    } finally {
      setCreatingTopic(false);
    }
  }

  async function setCurrentTopic(topicId: string | null) {
    try {
      await topicsApi.setCurrent(meetingId, topicId);
      toast.success(topicId ? 'Tema actual actualizado.' : 'Tema actual borrado.');
      onTopicChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    }
  }

  async function startTimer(topicId: string) {
    const dur = parseInt(timerDuration, 10) || 300;
    setStartingTimer(true);
    try {
      await timersApi.startTopic(meetingId, topicId, dur);
      toast.success('Timer iniciado.');
      onTimerChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setStartingTimer(false);
    }
  }

  async function stopTimer(timerId: string) {
    setStoppingTimer(true);
    try {
      await timersApi.stop(meetingId, timerId);
      toast.success('Timer detenido.');
      onTimerChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setStoppingTimer(false);
    }
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Gestión de Temas y Tiempos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3.5">
        <div className="space-y-1.5 text-left">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tema activo de debate</Label>
          <Select
            value={currentTopicId ?? '__none__'}
            onValueChange={(v) => setCurrentTopic(v === '__none__' ? null : v)}
          >
            <SelectTrigger className="w-full h-9 text-xs">
              <SelectValue placeholder="Sin tema activo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— Sin tema —</SelectItem>
              {topics.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Timer presets */}
        {currentTopic && (
          <div className="pt-2.5 border-t border-border space-y-2.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-left block">Cronómetro</Label>
            {activeTimer && activeTimer.topicId === currentTopic.id ? (
              <Button
                variant="destructive"
                className="w-full h-8 text-xs flex items-center justify-center gap-1.5 font-semibold"
                onClick={() => stopTimer(activeTimer.id)}
                disabled={stoppingTimer}
              >
                ⏹ Detener cronómetro
              </Button>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {TIMER_PRESETS.map((preset) => (
                    <Button
                      key={preset.value}
                      variant={timerDuration === String(preset.value) ? 'default' : 'outline'}
                      size="sm"
                      className="h-7 px-2 text-xs flex-1"
                      onClick={() => setTimerDuration(String(preset.value))}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="flex items-center gap-1 flex-1">
                    <Input
                      id="timer-dur"
                      type="number"
                      min={60}
                      max={3600}
                      value={timerDuration}
                      onChange={(e) => setTimerDuration(e.target.value)}
                      className="h-7 text-xs w-16 shrink-0"
                    />
                    <span className="text-[10px] text-muted-foreground font-medium">segundos</span>
                  </div>
                  <Button
                    size="sm"
                    className="h-7 px-3.5 text-xs font-semibold"
                    disabled={startingTimer}
                    onClick={() => startTimer(currentTopic.id)}
                  >
                    Iniciar
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Quick topic creation */}
        <div className="pt-2.5 border-t border-border space-y-2">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-left block">Añadir tema al final</Label>
          <div className="flex gap-1.5 flex-col">
            <Input
              placeholder="Título del tema..."
              value={newTopicTitle}
              onChange={(e) => setNewTopicTitle(e.target.value)}
              className="h-8 text-xs"
            />
            <div className="flex gap-1.5 justify-between">
              <Select value={newTopicType} onValueChange={setNewTopicType}>
                <SelectTrigger className="h-8 text-xs flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DISCUSSION">Debate</SelectItem>
                  <SelectItem value="VOTING">Votación</SelectItem>
                  <SelectItem value="INFORMATIVE">Informativo</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                className="h-8 px-4 text-xs font-semibold"
                onClick={handleCreateTopic}
                disabled={creatingTopic}
              >
                {creatingTopic ? '...' : 'Añadir'}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ==========================================
// 3. ADMIN SPEAKER CONTROL
// ==========================================
type AdminSpeakerControlProps = {
  meetingId: string;
  currentSpeaker?: Speaker | null;
  nextSpeaker?: Speaker | null;
  currentTopicId?: string | null;
  onBehalfOf?: string | null;
  onSetOnBehalfOf?: (name: string | null) => void;
  className?: string;
};

export function AdminSpeakerControl({
  meetingId,
  currentSpeaker,
  nextSpeaker,
  currentTopicId,
  onBehalfOf,
  onSetOnBehalfOf,
  className,
}: AdminSpeakerControlProps) {
  const { user } = useAuthState();
  const canSpeakOnBehalf = user?.role === 'SECRETARY' || user?.role === 'RDR';
  const [naming, setNaming] = useState(false);
  const [guestName, setGuestName] = useState('');

  async function handleSetCurrentSpeaker(userId: string | null) {
    try {
      await queueApi.setCurrentSpeaker(meetingId, userId);
      toast.success(userId ? 'Orador actualizado.' : 'Orador quitado.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    }
  }

  async function startOnBehalf() {
    const name = guestName.trim();
    if (!name || !user) return;
    try {
      await queueApi.setCurrentSpeaker(meetingId, user.id);
      onSetOnBehalfOf?.(name);
      setNaming(false);
      setGuestName('');
      if (!currentTopicId) {
        toast.info('No hay un tema activo: la transcripción no se guardará hasta que se active un tema.');
      } else {
        toast.success(`Tomaste la voz en nombre de ${name}.`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    }
  }

  async function endOnBehalf() {
    try {
      await queueApi.setCurrentSpeaker(meetingId, null);
      onSetOnBehalfOf?.(null);
      toast.success('Terminó la intervención en nombre del invitado.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    }
  }

  async function promoteNextSpeaker() {
    if (!nextSpeaker) return;
    try {
      await queueApi.setCurrentSpeaker(meetingId, nextSpeaker.id);
      toast.success('Se dio la palabra al siguiente orador.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    }
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Gestión de Palabra</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {currentSpeaker ? (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="size-2 rounded-full bg-primary animate-pulse shrink-0" />
              <span className="text-sm font-semibold truncate">{currentSpeaker.fullName}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs px-2 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() => handleSetCurrentSpeaker(null)}
            >
              Quitar
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic text-center py-2 bg-muted/10 border border-dashed rounded-lg">
            Nadie tiene la palabra actualmente.
          </p>
        )}

        {nextSpeaker ? (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-semibold truncate">{nextSpeaker.fullName}</span>
              <Badge variant="secondary" className="text-[9px] px-1.5 py-0 shrink-0">Siguiente</Badge>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs px-2.5 font-medium shrink-0"
              onClick={promoteNextSpeaker}
            >
              Habilitar
            </Button>
          </div>
        ) : null}

        <TakeFloorControl
          meetingId={meetingId}
          currentSpeaker={currentSpeaker}
          currentTopicId={currentTopicId}
        />

        {canSpeakOnBehalf && (
          <div className="pt-1.5 border-t border-border/40">
            {onBehalfOf ? (
              <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 space-y-2">
                <p className="text-xs text-warning-foreground">
                  🎤 Hablando en nombre de <span className="font-semibold">{onBehalfOf}</span>
                </p>
                <Button variant="outline" size="sm" className="w-full h-7 text-xs" onClick={endOnBehalf}>
                  Terminar intervención
                </Button>
              </div>
            ) : naming ? (
              <div className="space-y-2">
                <Input
                  autoFocus
                  placeholder="Nombre del invitado…"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') startOnBehalf();
                    if (e.key === 'Escape') { setNaming(false); setGuestName(''); }
                  }}
                  className="h-8 text-sm"
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-7 text-xs"
                    onClick={() => { setNaming(false); setGuestName(''); }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 h-7 text-xs"
                    onClick={startOnBehalf}
                    disabled={!guestName.trim()}
                  >
                    Tomar voz
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="w-full h-8 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setNaming(true)}
              >
                🎤 Tomar voz en nombre de…
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ==========================================
// 4. ADMIN VOTING CONTROL
// ==========================================
type AdminVotingControlProps = {
  meetingId: string;
  activeVoteSession: ActiveVoteSession | null;
  voteResult?: VoteResult | null;
  clubAttendance?: { clubId: string; clubName: string; connected: boolean }[];
  currentTopic?: Topic | null;
  topics?: Topic[];
  currentTopicId?: string | null;
  onVoteOpened?: () => void;
  onVoteClosed?: () => void;
  className?: string;
};

export function AdminVotingControl({
  meetingId,
  activeVoteSession,
  voteResult,
  clubAttendance = [],
  currentTopic,
  topics = [],
  currentTopicId,
  onVoteOpened,
  onVoteClosed,
  className,
}: AdminVotingControlProps) {
  const [closing, setClosing] = useState(false);
  const [confirmCloseVote, setConfirmCloseVote] = useState(false);
  const [votingMethod, setVotingMethod] = useState('PUBLIC');
  const [requiredMajority, setRequiredMajority] = useState('SIMPLE');
  const [ballotType, setBallotType] = useState<'YES_NO' | 'CANDIDATE'>('YES_NO');
  const [candidates, setCandidates] = useState<{ displayName: string; userId?: string | null }[]>([{ displayName: '' }, { displayName: '' }]);
  const [voteType, setVoteType] = useState<'GENERAL' | 'RDR' | 'EVENT' | 'CUSTOM_CANDIDATE'>('GENERAL');
  const [availableUsers, setAvailableUsers] = useState<{ id: string; fullName: string; email: string }[]>([]);
  const [availableClubs, setAvailableClubs] = useState<{ id: string; name: string }[]>([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [rdrChoice, setRdrChoice] = useState<'YES' | 'NO' | null>(null);
  const [rdrCandidateId, setRdrCandidateId] = useState<string | null>(null);
  const [showVoteReadyModal, setShowVoteReadyModal] = useState(false);
  const [pendingVoteTopicId, setPendingVoteTopicId] = useState<string | null>(null);

  useEffect(() => {
    usersApi.list().then(setAvailableUsers).catch(() => {});
    clubsApi.list().then(setAvailableClubs).catch(() => {});
  }, []);

  const pendingClubs = activeVoteSession
    ? clubAttendance.filter((c) => !activeVoteSession.votedClubIds?.includes(c.clubId))
    : [];

  const tiedCandidates: CandidateResult[] = voteResult?.candidateResult
    ? voteResult.candidateResult.candidateResults.filter(
        (c) => c.votes === voteResult.candidateResult!.candidateResults[0]?.votes && c.votes > 0,
      )
    : [];

  const currentTopicIndex = topics.findIndex((t) => t.id === currentTopicId);
  let previousNormalTopic: Topic | null = null;
  if (currentTopicIndex > -1) {
    for (let i = currentTopicIndex - 1; i >= 0; i--) {
      const t = topics[i];
      if (t.type !== 'VOTING' && !t.title?.startsWith('Moción:')) {
        previousNormalTopic = t;
        break;
      }
    }
  }
  const currentTopicIsMotion = currentTopic?.title?.startsWith('Moción:');
  const showReturnButton = !!(currentTopicIsMotion && previousNormalTopic);

  async function setCurrentTopic(topicId: string | null) {
    try {
      await topicsApi.setCurrent(meetingId, topicId);
      toast.success(topicId ? 'Tema actual actualizado.' : 'Tema actual borrado.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    }
  }

  async function openVote(topicId: string) {
    const opts: Parameters<typeof votingApi.open>[2] = {
      votingMethod: votingMethod as 'PUBLIC' | 'SECRET',
      requiredMajority,
      ballotType,
    };
    if (ballotType === 'CANDIDATE') {
      opts.candidates = candidates
        .filter((c) => c.displayName.trim())
        .map((c) => ({
          displayName: c.displayName.trim(),
          userId: c.userId || undefined,
        }));
      opts.isElection = true;
      opts.electionType = voteType === 'RDR' ? 'RDR' : voteType === 'EVENT' ? 'EVENT' : undefined;
    }
    try {
      await votingApi.open(meetingId, topicId, opts);
      setShowVoteReadyModal(false);
      setPendingVoteTopicId(null);
      toast.success('Votación abierta.');
      onVoteOpened?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    }
  }

  function handleOpenVoteClick(topicId: string) {
    if (ballotType === 'CANDIDATE') {
      const valid = candidates.filter((c) => c.displayName.trim());
      if (valid.length < 1) {
        toast.error('Ingresá al menos un candidato.');
        return;
      }
    }
    const disconnected = clubAttendance.filter((c) => !c.connected);
    if (disconnected.length > 0 && clubAttendance.length > 0) {
      setPendingVoteTopicId(topicId);
      setShowVoteReadyModal(true);
    } else {
      openVote(topicId);
    }
  }

  const handleAllPresent = useCallback(() => {
    if (pendingVoteTopicId) {
      setShowVoteReadyModal(false);
      openVote(pendingVoteTopicId);
      setPendingVoteTopicId(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingVoteTopicId]);

  async function closeVote(voteSessionId: string) {
    setClosing(true);
    try {
      await votingApi.close(meetingId, voteSessionId);
      toast.success('Votación cerrada.');
      setConfirmCloseVote(false);
      onVoteClosed?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setClosing(false);
    }
  }

  async function handleOpenRunoff(previousSessionId: string) {
    setActionLoading(true);
    try {
      await votingApi.openRunoff(meetingId, previousSessionId);
      toast.success('Segunda vuelta abierta (Art. 64i).');
      onVoteOpened?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRdrTiebreaker(voteSessionId: string) {
    if (!rdrChoice) { toast.error('Seleccioná una opción de desempate.'); return; }
    setActionLoading(true);
    try {
      await votingApi.rdrTiebreaker(meetingId, voteSessionId, rdrChoice);
      toast.success('Desempate del RDR aplicado (Art. 49).');
      setRdrChoice(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRdrCandidateTiebreaker(voteSessionId: string) {
    if (!rdrCandidateId) { toast.error('Seleccioná el candidato ganador.'); return; }
    setActionLoading(true);
    try {
      await votingApi.rdrCandidateTiebreaker(meetingId, voteSessionId, rdrCandidateId);
      toast.success('Desempate del RDR aplicado (Art. 49).');
      setRdrCandidateId(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3 border-b border-border mb-4">
        <CardTitle className="text-base flex items-center justify-between gap-3">
          <span>Control de Votaciones</span>
          {activeVoteSession && (
            <Badge variant="success" className="animate-pulse px-2 py-0.5 text-xs">Voto Activo</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {activeVoteSession ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-primary/10 pb-2">
                <Badge variant="info">
                  {activeVoteSession.ballotType === 'CANDIDATE' ? 'Elección' : 'Votación'} abierta
                  {(activeVoteSession.round ?? 1) > 1 ? ` — Ronda ${activeVoteSession.round}` : ''}
                </Badge>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmCloseVote(true)}
                  className="h-8 font-semibold"
                >
                  Cerrar votación
                </Button>
              </div>
              <div className="text-left">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Asunto de Votación</p>
                <h4 className="font-bold text-base text-foreground mt-0.5 leading-snug">{activeVoteSession.topicTitle}</h4>
              </div>
              {activeVoteSession.ballotType === 'CANDIDATE' && (activeVoteSession.candidates?.length ?? 0) > 0 && (
                <div className="text-xs text-muted-foreground space-y-1 text-left">
                  <p className="font-semibold uppercase tracking-wider text-[10px]">Candidatos:</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {activeVoteSession.candidates!.map((c, i) => (
                      <span key={c.id} className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-[10px] font-medium border border-border">
                        {String.fromCharCode(65 + i)}. {c.displayName}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Live progress indicators */}
            <div className="grid grid-cols-2 gap-3 text-center rounded-lg border border-border p-3 bg-muted/10">
              <div className="border-r border-border pb-1">
                <span className="text-2xl font-bold tabular-nums block text-foreground">
                  {activeVoteSession.votedClubIds?.length ?? 0}
                </span>
                <span className="text-[10px] text-muted-foreground uppercase font-medium">Votos Recibidos</span>
              </div>
              <div className="pb-1">
                <span className="text-2xl font-bold tabular-nums block text-foreground">
                  {pendingClubs.length}
                </span>
                <span className="text-[10px] text-muted-foreground uppercase font-medium">Pendientes</span>
              </div>
            </div>

            {/* Inline Manual Voting Panel */}
            {pendingClubs.length > 0 && activeVoteSession.votingMethod !== 'SECRET' && (
              <div className="rounded-xl border border-border p-4 space-y-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-left">
                  Carga rápida de Votos Manuales ({pendingClubs.length})
                </h4>
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {pendingClubs.map((club) => (
                    <div
                      key={club.clubId}
                      className="flex items-center justify-between gap-3 border-b border-border/50 pb-2 last:border-0 last:pb-0"
                    >
                      <span className="text-xs font-medium truncate flex-1 flex flex-col text-left">
                        <span>{club.clubName}</span>
                        <span className={cn('text-[9px]', club.connected ? 'text-success font-medium' : 'text-muted-foreground')}>
                          {club.connected ? '● En línea' : '○ Offline'}
                        </span>
                      </span>
                      {activeVoteSession.ballotType === 'CANDIDATE' && (activeVoteSession.candidates?.length ?? 0) > 1 ? (
                        <Select
                          onValueChange={async (candidateId) => {
                            try {
                              await votingApi.manual(
                                  meetingId,
                                  activeVoteSession.id,
                                  club.clubId,
                                  candidateId === 'ABSTAIN' ? 'ABSTAIN' : 'YES',
                                  candidateId === 'ABSTAIN' ? undefined : candidateId,
                                );
                              toast.success(`Voto registrado para ${club.clubName}`);
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : 'Error');
                            }
                          }}
                        >
                          <SelectTrigger className="h-7 text-xs w-28 shrink-0">
                            <SelectValue placeholder="Votar" />
                          </SelectTrigger>
                          <SelectContent>
                            {activeVoteSession.candidates?.map((cand) => (
                              <SelectItem key={cand.id} value={cand.id}>
                                {cand.displayName}
                              </SelectItem>
                            ))}
                            <SelectItem value="ABSTAIN">Abstención</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className="flex gap-1 shrink-0">
                          <Button
                            size="sm"
                            className="h-6 px-2 text-[10px] bg-success/15 hover:bg-success/25 text-success border-0 animate-none"
                            onClick={async () => {
                              try {
                                const candId = activeVoteSession.ballotType === 'CANDIDATE' && activeVoteSession.candidates?.[0]?.id || undefined;
                                await votingApi.manual(meetingId, activeVoteSession.id, club.clubId, 'YES', candId);
                                toast.success(`A favor registrado para ${club.clubName}`);
                              } catch (e) {
                                toast.error(e instanceof Error ? e.message : 'Error');
                              }
                            }}
                          >
                            Sí
                          </Button>
                          <Button
                            size="sm"
                            className="h-6 px-2 text-[10px] bg-destructive/15 hover:bg-destructive/25 text-destructive border-0 animate-none"
                            onClick={async () => {
                              try {
                                const candId = activeVoteSession.ballotType === 'CANDIDATE' && activeVoteSession.candidates?.[0]?.id || undefined;
                                await votingApi.manual(meetingId, activeVoteSession.id, club.clubId, 'NO', candId);
                                toast.success(`En contra registrado para ${club.clubName}`);
                              } catch (e) {
                                toast.error(e instanceof Error ? e.message : 'Error');
                              }
                            }}
                          >
                            No
                          </Button>
                          <Button
                            size="sm"
                            className="h-6 px-2 text-[10px] bg-muted-foreground/15 hover:bg-muted-foreground/25 text-muted-foreground border-0 animate-none"
                            onClick={async () => {
                              try {
                                const candId = activeVoteSession.ballotType === 'CANDIDATE' && activeVoteSession.candidates?.[0]?.id || undefined;
                                await votingApi.manual(meetingId, activeVoteSession.id, club.clubId, 'ABSTAIN', candId);
                                toast.success(`Abstención registrada para ${club.clubName}`);
                              } catch (e) {
                                toast.error(e instanceof Error ? e.message : 'Error');
                              }
                            }}
                          >
                            Abs
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {showReturnButton && (
              <div className="mb-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentTopic(previousNormalTopic!.id)}
                  className="w-full flex items-center justify-center gap-1.5 border-dashed border-primary text-primary hover:bg-primary/5 font-semibold text-xs py-4"
                >
                  ↩ Volver a debate: {previousNormalTopic!.title}
                </Button>
              </div>
            )}

            {/* Post-close result + actions */}
            {voteResult && (
              <div className="space-y-3 p-4 bg-muted/10 border border-border rounded-xl">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 text-center">Último resultado</p>
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

                {/* RDR Tiebreaker — YES/NO vote */}
                {voteResult.isTied && voteResult.ballotType !== 'CANDIDATE' && !voteResult.rdrTiebreakerUsed && (
                  <div className="rounded-lg border border-warning/45 bg-warning/5 p-3 space-y-2 mt-3 text-left">
                    <p className="text-xs font-semibold text-warning-foreground">⚠️ Desempate RDR (Art. 49)</p>
                    <p className="text-[11px] text-muted-foreground">La votación resultó en empate. Seleccioná el voto de calidad:</p>
                    <div className="flex gap-1.5 justify-between">
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant={rdrChoice === 'YES' ? 'default' : 'outline'}
                          className={cn("h-7 text-xs font-medium", rdrChoice === 'YES' && 'bg-success hover:bg-success/90 border-success text-white')}
                          onClick={() => setRdrChoice('YES')}
                        >
                          Sí
                        </Button>
                        <Button
                          size="sm"
                          variant={rdrChoice === 'NO' ? 'default' : 'outline'}
                          className={cn("h-7 text-xs font-medium", rdrChoice === 'NO' && 'bg-destructive hover:bg-destructive/90 border-destructive text-white')}
                          onClick={() => setRdrChoice('NO')}
                        >
                          No
                        </Button>
                      </div>
                      <Button
                        size="sm"
                        className="h-7 text-xs font-semibold"
                        disabled={!rdrChoice || actionLoading}
                        onClick={() => handleRdrTiebreaker(voteResult.voteSessionId)}
                      >
                        {actionLoading ? '...' : 'Aplicar'}
                      </Button>
                    </div>
                  </div>
                )}

                {/* RDR Tiebreaker — Candidate vote */}
                {voteResult.candidateResult?.isTied && !voteResult.rdrTiebreakerUsed && (
                  <div className="rounded-lg border border-warning/45 bg-warning/5 p-3 space-y-2.5 mt-3 text-left">
                    <p className="text-xs font-semibold text-warning-foreground">⚠️ Desempate RDR — Elección (Art. 49)</p>
                    <p className="text-[11px] text-muted-foreground">Elegí al candidato que ganará el empate:</p>
                    <div className="space-y-1">
                      {tiedCandidates.map((c) => (
                        <button
                          key={c.candidateId}
                          onClick={() => setRdrCandidateId(c.candidateId)}
                          className={cn(
                            'w-full text-left rounded-md px-2.5 py-1.5 text-xs border transition-colors font-medium flex items-center justify-between',
                            rdrCandidateId === c.candidateId
                              ? 'border-primary bg-primary/10 text-primary font-semibold'
                              : 'border-border bg-background hover:bg-muted',
                          )}
                        >
                          <span>{c.displayName}</span>
                          <span className="font-semibold tabular-nums">{c.votes} v</span>
                        </button>
                      ))}
                    </div>
                    <Button
                      size="sm"
                      className="w-full h-8 text-xs mt-1 font-semibold"
                      disabled={!rdrCandidateId || actionLoading}
                      onClick={() => handleRdrCandidateTiebreaker(voteResult.voteSessionId)}
                    >
                      {actionLoading ? 'Aplicando...' : 'Confirmar ganador'}
                    </Button>
                  </div>
                )}

                {/* Open runoff */}
                {voteResult.candidateResult?.needsRunoff && !voteResult.candidateResult?.winner && (
                  <div className="rounded-lg border border-info/40 bg-info/5 p-3 space-y-2 mt-3 text-left">
                    <p className="text-xs font-semibold text-info-foreground">🗳️ Segunda vuelta requerida (Art. 64i)</p>
                    <p className="text-[11px] text-muted-foreground">Ningún candidato obtuvo mayoría absoluta. Se requiere segunda vuelta.</p>
                    <Button
                      size="sm"
                      className="w-full h-8 text-xs mt-1 font-semibold"
                      disabled={actionLoading}
                      onClick={() => handleOpenRunoff(voteResult.voteSessionId)}
                    >
                      {actionLoading ? 'Abriendo...' : 'Abrir segunda vuelta'}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Launch new vote form */}
            {meetingId && !currentTopicIsMotion && currentTopic && (
              <div className="space-y-3.5 pt-2 text-left">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Lanzar votación en este tema</h4>
                
                {/* Vote type selector */}
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Tipo de votación</Label>
                  <Select
                    value={voteType}
                    onValueChange={(val: any) => {
                      setVoteType(val);
                      if (val === 'GENERAL') {
                        setBallotType('YES_NO');
                        setRequiredMajority('SIMPLE');
                      } else {
                        setBallotType('CANDIDATE');
                        setRequiredMajority('ABSOLUTE');
                        if (candidates.length < 1) {
                          setCandidates([{ displayName: '' }]);
                        }
                      }
                    }}
                  >
                    <SelectTrigger className="w-full h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GENERAL">Moción General (Sí/No/Abs)</SelectItem>
                      <SelectItem value="RDR">Elección de RDR (Art. 64)</SelectItem>
                      <SelectItem value="EVENT">Elección de Sede (Eventos)</SelectItem>
                      <SelectItem value="CUSTOM_CANDIDATE">Elección Personalizada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Candidate list configuration */}
                {ballotType === 'CANDIDATE' && (
                  <div className="space-y-2 rounded-lg border border-border p-3 bg-muted/5">
                    <Label className="text-[11px] font-semibold">Candidatos / Opciones</Label>
                    
                    {voteType === 'RDR' ? (
                      <div className="space-y-2">
                        {candidates.map((c, idx) => (
                          <div key={idx} className="flex gap-2 items-center">
                            <span className="text-xs font-bold text-primary w-4">{String.fromCharCode(65 + idx)}</span>
                            <Input
                              placeholder={`Nombre del candidato ${idx + 1}...`}
                              value={c.displayName}
                              onChange={(e) => {
                                const next = [...candidates];
                                next[idx] = { displayName: e.target.value, userId: null };
                                setCandidates(next);
                              }}
                              className="h-8 text-xs flex-1"
                            />
                            {candidates.length > 1 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCandidates(candidates.filter((_, i) => i !== idx))}
                                className="h-8 px-2 text-destructive hover:bg-destructive/5 shrink-0"
                              >
                                Quitar
                              </Button>
                            )}
                          </div>
                        ))}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setCandidates([...candidates, { displayName: '', userId: null }])}
                          className="h-7 text-xs w-full"
                        >
                          ＋ Añadir candidato
                        </Button>
                      </div>
                    ) : voteType === 'EVENT' ? (
                      <div className="space-y-2">
                        {candidates.map((c, idx) => (
                          <div key={idx} className="flex gap-2 items-center">
                            <span className="text-xs font-bold text-primary w-4">{String.fromCharCode(65 + idx)}</span>
                            <Select
                              value={c.displayName || '__none__'}
                              onValueChange={(v) => {
                                const next = [...candidates];
                                next[idx] = { displayName: v, userId: null };
                                setCandidates(next);
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs flex-1">
                                <SelectValue placeholder="Seleccionar Club" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">— Seleccionar Club —</SelectItem>
                                {availableClubs.map((club) => (
                                  <SelectItem key={club.id} value={club.name}>
                                    {club.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {candidates.length > 1 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCandidates(candidates.filter((_, i) => i !== idx))}
                                className="h-8 px-2 text-destructive hover:bg-destructive/5 shrink-0"
                              >
                                Quitar
                              </Button>
                            )}
                          </div>
                        ))}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setCandidates([...candidates, { displayName: '', userId: null }])}
                          className="h-7 text-xs w-full"
                        >
                          ＋ Añadir sede
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {candidates.map((cand, idx) => (
                          <div key={idx} className="flex gap-2 items-center">
                            <span className="text-xs font-bold text-primary w-4">{String.fromCharCode(65 + idx)}</span>
                            <Input
                              placeholder={`Candidato ${idx + 1}...`}
                              value={cand.displayName}
                              onChange={(e) => {
                                const next = [...candidates];
                                next[idx] = { displayName: e.target.value, userId: cand.userId };
                                setCandidates(next);
                              }}
                              className="h-8 text-xs flex-1"
                            />
                            {candidates.length > 1 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCandidates(candidates.filter((_, i) => i !== idx))}
                                className="h-8 px-2 text-destructive hover:bg-destructive/5 shrink-0"
                              >
                                Quitar
                              </Button>
                            )}
                          </div>
                        ))}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setCandidates([...candidates, { displayName: '', userId: null }])}
                          className="h-7 text-xs w-full"
                        >
                          ＋ Añadir opción
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* Voting method & majority controls */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Sistema</Label>
                    <Select value={votingMethod} onValueChange={setVotingMethod}>
                      <SelectTrigger className="h-8 text-xs w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PUBLIC">Público</SelectItem>
                        <SelectItem value="SECRET">Secreto</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Mayoría</Label>
                    <Select value={requiredMajority} onValueChange={setRequiredMajority}>
                      <SelectTrigger className="h-8 text-xs w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SIMPLE">Simple</SelectItem>
                        <SelectItem value="ABSOLUTE">Absoluta</SelectItem>
                        <SelectItem value="TWO_THIRDS">2/3</SelectItem>
                        <SelectItem value="THREE_QUARTERS">3/4</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Open vote button */}
                <Button
                  className="w-full mt-1.5 h-9 text-xs font-bold"
                  onClick={() => currentTopic && handleOpenVoteClick(currentTopic.id)}
                >
                  🚀 Lanzar Votación General
                </Button>
              </div>
            )}
            {!currentTopic && (
              <p className="text-xs text-muted-foreground text-center py-4 italic">
                Seleccioná un tema en debate para abrir votaciones generales.
              </p>
            )}
          </div>
        )}
      </CardContent>

      {/* Confirm close vote dialog */}
      <Dialog open={confirmCloseVote} onOpenChange={setConfirmCloseVote}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cerrar votación</DialogTitle>
            <DialogDescription>
              {pendingClubs.length > 0
                ? `Hay ${pendingClubs.length} clubes que aún no han emitido su voto. Podés registrar sus votos manualmente o finalizar la votación con los votos actuales.`
                : '¿Estás seguro? No se podrán registrar más votos una vez cerrada.'}
            </DialogDescription>
          </DialogHeader>

          {activeVoteSession && pendingClubs.length > 0 && (
            <div className="space-y-3 py-2 border-t border-b border-border my-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Clubes pendientes ({pendingClubs.length}):
              </p>
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {pendingClubs.map((club) => (
                  <div
                    key={club.clubId}
                    className="flex items-center justify-between gap-2 border-b border-border/50 pb-2 last:border-0 last:pb-0"
                  >
                    <span className="text-xs font-medium truncate flex-1 flex flex-col text-left">
                      <span>{club.clubName}</span>
                      <span className={cn(
                        'text-[10px]',
                        club.connected ? 'text-success font-medium' : 'text-muted-foreground'
                      )}>
                        {club.connected ? '● Conectado (Activo)' : '○ Desconectado (Inactivo)'}
                      </span>
                    </span>
                    {activeVoteSession.votingMethod !== 'SECRET' ? (
                      activeVoteSession.ballotType === 'CANDIDATE' && (activeVoteSession.candidates?.length ?? 0) > 1 ? (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Select
                            onValueChange={async (candidateId) => {
                              try {
                                  await votingApi.manual(
                                    meetingId,
                                    activeVoteSession.id,
                                    club.clubId,
                                    candidateId === 'ABSTAIN' ? 'ABSTAIN' : 'YES',
                                    candidateId === 'ABSTAIN' ? undefined : candidateId,
                                  );
                                  toast.success(`Voto registrado para ${club.clubName}`);
                              } catch (e) {
                                  toast.error(e instanceof Error ? e.message : 'Error');
                              }
                            }}
                          >
                            <SelectTrigger className="h-7 text-xs w-28 shrink-0">
                              <SelectValue placeholder="Votar" />
                            </SelectTrigger>
                            <SelectContent>
                              {activeVoteSession.candidates?.map((cand) => (
                                <SelectItem key={cand.id} value={cand.id}>
                                  {cand.displayName}
                                </SelectItem>
                              ))}
                              <SelectItem value="ABSTAIN">Abstención</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      ) : (
                        <div className="flex gap-1 shrink-0">
                          <Button
                            size="sm"
                            className="h-7 px-2 text-[10px] bg-success/15 hover:bg-success/25 text-success border-0 animate-none"
                            onClick={async () => {
                              try {
                                const candId = activeVoteSession.ballotType === 'CANDIDATE' && activeVoteSession.candidates?.[0]?.id || undefined;
                                await votingApi.manual(meetingId, activeVoteSession.id, club.clubId, 'YES', candId);
                                toast.success(`A favor registrado para ${club.clubName}`);
                              } catch (e) {
                                toast.error(e instanceof Error ? e.message : 'Error');
                              }
                            }}
                          >
                            Sí
                          </Button>
                          <Button
                            size="sm"
                            className="h-7 px-2 text-[10px] bg-destructive/15 hover:bg-destructive/25 text-destructive border-0 animate-none"
                            onClick={async () => {
                              try {
                                const candId = activeVoteSession.ballotType === 'CANDIDATE' && activeVoteSession.candidates?.[0]?.id || undefined;
                                await votingApi.manual(meetingId, activeVoteSession.id, club.clubId, 'NO', candId);
                                toast.success(`En contra registrado para ${club.clubName}`);
                              } catch (e) {
                                toast.error(e instanceof Error ? e.message : 'Error');
                              }
                            }}
                          >
                            No
                          </Button>
                          <Button
                            size="sm"
                            className="h-7 px-2 text-[10px] bg-muted-foreground/15 hover:bg-muted-foreground/25 text-muted-foreground border-0 animate-none"
                            onClick={async () => {
                              try {
                                const candId = activeVoteSession.ballotType === 'CANDIDATE' && activeVoteSession.candidates?.[0]?.id || undefined;
                                await votingApi.manual(meetingId, activeVoteSession.id, club.clubId, 'ABSTAIN', candId);
                                toast.success(`Abstención registrada para ${club.clubName}`);
                              } catch (e) {
                                toast.error(e instanceof Error ? e.message : 'Error');
                              }
                            }}
                          >
                            Abs
                          </Button>
                        </div>
                      )
                    ) : (
                      <span className="text-[10px] text-warning italic shrink-0">
                        Voto Secreto
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmCloseVote(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={closing}
              onClick={() => activeVoteSession && closeVote(activeVoteSession.id)}
            >
              {closing ? 'Cerrando...' : 'Cerrar votación de todas formas'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Vote ready modal */}
      <VoteReadyModal
        open={showVoteReadyModal}
        onOpenChange={setShowVoteReadyModal}
        clubAttendance={clubAttendance}
        topicTitle={activeVoteSession?.topicTitle ?? ''}
        onContinue={() => {
          if (pendingVoteTopicId) openVote(pendingVoteTopicId);
        }}
        onAllPresent={handleAllPresent}
      />
    </Card>
  );
}

// ==========================================
// 5. ADMIN MOTIONS CONTROL
// ==========================================
type AdminMotionsControlProps = {
  meetingId: string;
  motions?: any[];
  onVoteOpened?: () => void;
  className?: string;
};

export function AdminMotionsControl({
  meetingId,
  motions = [],
  onVoteOpened,
  className,
}: AdminMotionsControlProps) {
  const [motionVoteMethod, setMotionVoteMethod] = useState<Record<string, 'PUBLIC' | 'SECRET'>>({});
  const [motionVoteMajority, setMotionVoteMajority] = useState<Record<string, 'SIMPLE' | 'ABSOLUTE' | 'TWO_THIRDS' | 'THREE_QUARTERS'>>({});
  const [actionLoading, setActionLoading] = useState(false);

  async function handleLaunchMotionVote(motionId: string) {
    const method = motionVoteMethod[motionId] ?? 'PUBLIC';
    const majority = motionVoteMajority[motionId] ?? 'SIMPLE';
    setActionLoading(true);
    try {
      await motionsApi.launchVote(meetingId, motionId, { votingMethod: method, requiredMajority: majority });
      toast.success('Votación de moción iniciada.');
      onVoteOpened?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al lanzar votación');
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3 border-b border-border mb-4">
        <CardTitle className="text-base">Mociones de la Sala</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {motions.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6 border border-dashed rounded-lg bg-muted/5 italic">
            No hay mociones registradas en esta reunión.
          </p>
        ) : (
          <div className="space-y-3.5">
            {motions.map((m) => {
              const isProposed = m.status === 'PROPOSED';
              const isSeconded = m.status === 'SECONDED';
              const isVoting = m.status === 'VOTING';
              const isApproved = m.status === 'APPROVED';
              const isRejected = m.status === 'REJECTED';
              const canVote = isSeconded;

              return (
                <div key={m.id} className="rounded-xl border border-border p-3.5 space-y-3 bg-muted/5">
                  <div className="flex items-start justify-between gap-3 flex-wrap sm:flex-nowrap">
                    <div className="space-y-1 min-w-0 flex-1 text-left">
                      <h4 className="font-bold text-sm text-foreground truncate">{m.title}</h4>
                      {m.description && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{m.description}</p>}
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Propone: <span className="font-semibold text-foreground">{m.proposedByClubName}</span>
                        {m.secondedByClubName && (
                          <> • Secunda: <span className="font-semibold text-foreground">{m.secondedByClubName}</span></>
                        )}
                      </p>
                    </div>
                    <Badge
                      className="shrink-0 text-[10px] px-2 py-0.5 font-semibold"
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

                  {canVote && (
                    <div className="pt-2.5 border-t border-border/50 flex flex-wrap items-center justify-between gap-2.5">
                      <div className="flex gap-2 flex-1 min-w-[200px]">
                        <div className="space-y-0.5 flex-1 text-left">
                          <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Sistema</label>
                          <Select
                            value={motionVoteMethod[m.id] ?? 'PUBLIC'}
                            onValueChange={(val: any) => setMotionVoteMethod({ ...motionVoteMethod, [m.id]: val })}
                          >
                            <SelectTrigger className="h-7 text-xs px-2 py-0">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="PUBLIC">Público</SelectItem>
                              <SelectItem value="SECRET">Secreto</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-0.5 flex-1 text-left">
                          <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Mayoría</label>
                          <Select
                            value={motionVoteMajority[m.id] ?? 'SIMPLE'}
                            onValueChange={(val: any) => setMotionVoteMajority({ ...motionVoteMajority, [m.id]: val })}
                          >
                            <SelectTrigger className="h-7 text-xs px-2 py-0">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="SIMPLE">Simple</SelectItem>
                              <SelectItem value="ABSOLUTE">Absoluta</SelectItem>
                              <SelectItem value="TWO_THIRDS">2/3</SelectItem>
                              <SelectItem value="THREE_QUARTERS">3/4</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        disabled={actionLoading}
                        onClick={() => handleLaunchMotionVote(m.id)}
                        className="h-7 px-3.5 text-xs font-semibold self-end shrink-0"
                      >
                        🚀 Votar Moción
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
  );
}

// ==========================================
// 5b. ADMIN TRANSCRIPTION CONTROL
// ==========================================
type AdminTranscriptionControlProps = {
  meetingId: string;
  transcriptionEnabled?: boolean;
  className?: string;
};

export function AdminTranscriptionControl({
  meetingId,
  transcriptionEnabled = true,
  className,
}: AdminTranscriptionControlProps) {
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    setLoading(true);
    try {
      await meetingsApi.toggleTranscription(meetingId, !transcriptionEnabled);
      toast.success(
        !transcriptionEnabled
          ? '🎙️ Transcripción habilitada. Los participantes podrán transcribir al hablar.'
          : '🔇 Transcripción deshabilitada. No se grabará audio hasta que se reactive.',
      );
    } catch {
      toast.error('No se pudo cambiar el estado de la transcripción.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className={cn('border', transcriptionEnabled ? 'border-primary/30' : 'border-border', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">🎙️</span>
            <CardTitle className="text-sm font-semibold">Transcripción automática</CardTitle>
          </div>
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
              transcriptionEnabled
                ? 'bg-primary/15 text-primary'
                : 'bg-muted text-muted-foreground',
            )}
          >
            <span
              className={cn(
                'size-1.5 rounded-full',
                transcriptionEnabled ? 'bg-primary animate-pulse' : 'bg-muted-foreground/50',
              )}
            />
            {transcriptionEnabled ? 'Activa' : 'Inactiva'}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          {transcriptionEnabled
            ? 'Los participantes que reciban la palabra verán el modal para activar su micrófono y se grabará audio para el acta.'
            : 'La transcripción está desactivada. Los participantes no verán el modal de micrófono aunque se les otorgue la palabra.'}
        </p>
        <Button
          variant={transcriptionEnabled ? 'outline' : 'default'}
          size="sm"
          className="w-full"
          onClick={handleToggle}
          disabled={loading}
        >
          {loading
            ? 'Actualizando...'
            : transcriptionEnabled
              ? '🔇 Deshabilitar transcripción'
              : '🎙️ Habilitar transcripción'}
        </Button>
      </CardContent>
    </Card>
  );
}

// ==========================================
// 6. DEFAULT COMBINED BACKWARD-COMPATIBLE EXPORT
// ==========================================
export function AdminLiveControls({
  meetingId,
  topics,
  currentTopicId,
  activeVoteSession,
  activeTimer,
  currentTopic,
  currentSpeaker,
  nextSpeaker,
  clubsPresent,
  clubAttendance = [],
  attendanceLocked = false,
  voteResult,
  motions = [],
  onVoteOpened,
  onVoteClosed,
  onTopicChanged,
  onTimerChanged,
  className,
}: any) {
  return (
    <div className={cn("space-y-6", className)}>
      <AdminAttendanceControl
        meetingId={meetingId}
        clubAttendance={clubAttendance}
        attendanceLocked={attendanceLocked}
        clubsPresent={clubsPresent}
      />
      <AdminTopicControl
        meetingId={meetingId}
        topics={topics}
        currentTopicId={currentTopicId}
        currentTopic={currentTopic}
        activeTimer={activeTimer}
        onTopicChanged={onTopicChanged}
        onTimerChanged={onTimerChanged}
      />
      <AdminSpeakerControl
        meetingId={meetingId}
        currentSpeaker={currentSpeaker}
        nextSpeaker={nextSpeaker}
      />
      <AdminVotingControl
        meetingId={meetingId}
        activeVoteSession={activeVoteSession}
        voteResult={voteResult}
        clubAttendance={clubAttendance}
        currentTopic={currentTopic}
        topics={topics}
        currentTopicId={currentTopicId}
        onVoteOpened={onVoteOpened}
        onVoteClosed={onVoteClosed}
      />
      <AdminMotionsControl
        meetingId={meetingId}
        motions={motions}
        onVoteOpened={onVoteOpened}
      />
    </div>
  );
}
