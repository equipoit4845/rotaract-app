'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useMeetingRoom } from '@/hooks/useMeetingRoom';
import { useAuthState } from '@/context/AuthContext';
import { CurrentTopicCard } from '@/components/CurrentTopicCard';
import { SpeakingQueueList } from '@/components/SpeakingQueueList';
import {
  AdminAttendanceControl,
  AdminTopicControl,
  AdminSpeakerControl,
  AdminVotingControl,
  AdminMotionsControl,
  AdminTranscriptionControl,
} from '@/components/AdminLiveControls';
import { QuorumIndicator } from '@/components/meetings/QuorumIndicator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { cn } from '@/lib/utils';
import { LiveTranscriber } from '@/components/meetings/LiveTranscriber';

export default function AdminLivePage() {
  const params = useParams();
  const meetingId = params.id as string;
  const { snapshot, voteResult, connected, joinError } = useMeetingRoom(meetingId);
  const { user } = useAuthState();

  // "Tomar voz en nombre de…": nombre del invitado bajo el cual la mesa transcribe.
  const [onBehalfOf, setOnBehalfOf] = useState<string | null>(null);

  // Si la mesa deja de ser el orador actual, se limpia el rótulo "en nombre de".
  const currentSpeakerId = snapshot?.currentSpeaker?.id;
  useEffect(() => {
    if (onBehalfOf && currentSpeakerId !== user?.id) {
      setOnBehalfOf(null);
    }
  }, [onBehalfOf, currentSpeakerId, user?.id]);

  return (
    <div className="space-y-6">
      {snapshot && (
        <LiveTranscriber
          meetingId={meetingId}
          currentSpeakerId={snapshot.currentSpeaker?.id}
          currentTopicId={snapshot.currentTopicId}
          transcriptionEnabled={snapshot.meeting?.transcriptionEnabled ?? true}
          onBehalfOf={onBehalfOf}
        />
      )}
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/admin/meetings/${meetingId}`}>← Volver</Link>
          </Button>
          <h1 className="text-lg font-semibold">Sala en vivo</h1>
          {snapshot && <StatusBadge status={snapshot.status} />}
        </div>
        <div className="flex items-center gap-2">
          <div className={cn('size-2 rounded-full', connected ? 'bg-success animate-pulse' : 'bg-destructive')} />
          <span className="text-xs text-muted-foreground">{connected ? 'Conectado' : 'Desconectado'}</span>
        </div>
      </div>

      {joinError && (
        <Card className="border-destructive">
          <CardContent className="p-4">
            <p className="text-sm text-destructive font-medium">{joinError}</p>
          </CardContent>
        </Card>
      )}

      {!snapshot && !joinError && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-48 w-full rounded-xl" />
          </div>
          <div>
            <Skeleton className="h-96 w-full rounded-xl" />
          </div>
        </div>
      )}

      {snapshot && (
        <div className="space-y-6">
          {snapshot.quorum && (
            <QuorumIndicator
              required={snapshot.quorum.required}
              present={snapshot.quorum.present}
              met={snapshot.quorum.met}
              isInformationalOnly={snapshot.quorum.isInformationalOnly}
            />
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <CurrentTopicCard
                topic={snapshot.currentTopic ?? { title: '—' }}
                timer={snapshot.activeTimer ?? null}
                topics={snapshot.topics}
                currentTopicId={snapshot.currentTopicId}
              />
              <AdminVotingControl
                meetingId={meetingId}
                activeVoteSession={snapshot.activeVoteSession ?? null}
                voteResult={voteResult}
                clubAttendance={snapshot.clubAttendance}
                currentTopic={snapshot.currentTopic}
                topics={snapshot.topics}
                currentTopicId={snapshot.currentTopicId}
              />
              <AdminMotionsControl
                meetingId={meetingId}
                motions={snapshot.motions}
              />
              <SpeakingQueueList
                items={snapshot.speakingQueue ?? []}
                meetingId={meetingId}
                isAdmin
                currentSpeaker={snapshot.currentSpeaker}
                nextSpeaker={snapshot.nextSpeaker}
              />
            </div>

            <div className="space-y-6 lg:sticky lg:top-20 lg:self-start">
              <AdminAttendanceControl
                meetingId={meetingId}
                clubAttendance={snapshot.clubAttendance}
                attendanceLocked={snapshot.attendanceLocked}
                clubsPresent={snapshot.quorum?.present ?? 0}
              />
              <AdminTranscriptionControl
                meetingId={meetingId}
                transcriptionEnabled={snapshot.meeting?.transcriptionEnabled ?? true}
              />
              <AdminTopicControl
                meetingId={meetingId}
                topics={snapshot.topics}
                currentTopicId={snapshot.currentTopicId}
                currentTopic={snapshot.currentTopic}
                activeTimer={snapshot.activeTimer ?? null}
              />
              <AdminSpeakerControl
                meetingId={meetingId}
                currentSpeaker={snapshot.currentSpeaker}
                nextSpeaker={snapshot.nextSpeaker}
                currentTopicId={snapshot.currentTopicId}
                onBehalfOf={onBehalfOf}
                onSetOnBehalfOf={setOnBehalfOf}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
