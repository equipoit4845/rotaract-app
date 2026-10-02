'use client';

import { formatTotalDuration } from '@/lib/format';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useMeetingDetailQuery, useMeetingTopicsQuery } from '@/lib/queries';
import { MEETING_STATUS_LABELS } from '@/lib/meeting-constants';
import { TopicListSortable } from '@/components/TopicListSortable';
import { EntityHero } from '@/components/ui/entity-hero';
import { StatStrip } from '@/components/ui/stat-strip';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type Meeting = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  scheduledAt?: string | null;
  club?: { name: string };
};

type Topic = {
  id: string;
  title: string;
  description?: string | null;
  order: number;
  type: string;
  estimatedDurationSec?: number | null;
  status: string;
};

export default function ParticipantMeetingDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { data: meetingData, isLoading, error } = useMeetingDetailQuery(id);
  const { data: topicsData } = useMeetingTopicsQuery(id);
  const meeting = meetingData as Meeting | undefined;
  const topics = (topicsData as Topic[] | undefined) ?? [];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <p className="text-sm text-destructive font-medium">
            {error instanceof Error ? error.message : 'No se pudo cargar la reunión.'}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!meeting) return null;

  const canEnterLive = meeting.status === 'LIVE' || meeting.status === 'PAUSED';
  const totalDuration = formatTotalDuration(topics);

  return (
    <div className="space-y-6">
      {/* Hero */}
      <EntityHero
        title={meeting.title}
        subtitle={[
          meeting.club?.name,
          meeting.scheduledAt
            ? new Date(meeting.scheduledAt).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' })
            : null,
        ].filter(Boolean).join(' · ')}
        badges={<StatusBadge status={meeting.status} />}
        actions={
          canEnterLive ? (
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href={`/meetings/${id}/live`} className="flex items-center gap-2">
                {meeting.status === 'LIVE' && (
                  <span className="size-2 rounded-full bg-white animate-pulse" />
                )}
                Entrar a la sala en vivo
              </Link>
            </Button>
          ) : undefined
        }
      />

      {/* Stats */}
      <StatStrip
        items={[
          { label: 'Temas', value: topics.length },
          { label: 'Duración est.', value: totalDuration },
          { label: 'Estado', value: MEETING_STATUS_LABELS[meeting.status] ?? meeting.status },
        ]}
      />

      {meeting.description && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{meeting.description}</p>
          </CardContent>
        </Card>
      )}

      {/* Agenda */}
      {topics.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Agenda</CardTitle>
            <CardDescription>{topics.length} tema{topics.length === 1 ? '' : 's'}</CardDescription>
          </CardHeader>
          <CardContent>
            <TopicListSortable
              meetingId={id}
              topics={topics}
              currentTopicId={null}
              canEdit={false}
              onTopicsChange={() => {}}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
