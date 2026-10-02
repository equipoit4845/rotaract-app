'use client';

import { TimerDisplay } from '@/components/TimerDisplay';
import { StatusBadge } from '@/components/ui/status-badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { TOPIC_TYPE_LABELS } from '@/lib/meeting-constants';

type Topic = {
  id?: string;
  title: string;
  type?: string;
  status?: string;
};

type Timer = {
  remainingSec: number;
  overtimeSec: number;
  plannedDurationSec?: number;
};

type AgendaItem = {
  id: string;
  status?: string;
};

type CurrentTopicCardProps = {
  topic: Topic | null;
  timer?: Timer | null;
  /** All topics for rendering agenda progress bar */
  topics?: AgendaItem[];
  /** ID of the current topic */
  currentTopicId?: string | null;
  className?: string;
};

export function CurrentTopicCard({
  topic,
  timer,
  topics,
  currentTopicId,
  className,
}: CurrentTopicCardProps) {
  if (!topic && !timer) return null;

  const currentIndex = topics?.findIndex((t) => t.id === currentTopicId) ?? -1;

  return (
    <Card className={cn('border-primary/30 bg-primary/5', className)}>
      <CardContent className="pt-4">
        <div className="space-y-3">
          {/* Agenda progress bar */}
          {topics && topics.length > 0 && (
            <div className="flex gap-1">
              {topics.map((t, i) => (
                <div
                  key={t.id}
                  className={cn(
                    'h-1.5 flex-1 rounded-full transition-colors',
                    i < currentIndex
                      ? 'bg-success'
                      : i === currentIndex
                        ? 'bg-primary animate-pulse'
                        : 'bg-muted',
                  )}
                />
              ))}
            </div>
          )}

          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Tema actual
                {topics && topics.length > 0 && currentIndex >= 0 && (
                  <span className="ml-2 normal-case tracking-normal">
                    ({currentIndex + 1} de {topics.length})
                  </span>
                )}
              </p>
              <p className="mt-1 text-xl font-semibold text-foreground">
                {topic?.title ?? '—'}
              </p>
              {topic && (
                <div className="mt-2 flex items-center gap-2">
                  {topic.type && (
                    <StatusBadge
                      status={topic.type}
                      label={TOPIC_TYPE_LABELS[topic.type] ?? topic.type}
                    />
                  )}
                </div>
              )}
            </div>

            {timer && (
              <TimerDisplay
                remainingSec={timer.remainingSec}
                overtimeSec={timer.overtimeSec}
                plannedDurationSec={timer.plannedDurationSec}
                size="sm"
              />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
