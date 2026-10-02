'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';
import { queueApi } from '@/lib/api';
import { toast } from 'sonner';
import { SPEAKING_STATUS_LABELS } from '@/lib/meeting-constants';

export type QueueItem = {
  id: string;
  userId: string;
  fullName: string;
  position: number;
  status?: string;
};

type Speaker = { id: string; fullName: string };

type SpeakingQueueListProps = {
  items: QueueItem[];
  meetingId?: string;
  isAdmin?: boolean;
  currentSpeaker?: Speaker | null;
  nextSpeaker?: Speaker | null;
  className?: string;
};

export function SpeakingQueueList({
  items,
  meetingId,
  isAdmin,
  currentSpeaker,
  nextSpeaker,
  className,
}: SpeakingQueueListProps) {
  const sorted = [...items].sort((a, b) => a.position - b.position);
  const [loading, setLoading] = useState<string | null>(null);

  async function handleSetCurrentSpeaker(userId: string) {
    if (!meetingId) return;
    setLoading(userId);
    try {
      await queueApi.setCurrentSpeaker(meetingId, userId);
      toast.success('Orador actualizado.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(null);
    }
  }

  async function handleSetNextSpeaker(userId: string) {
    if (!meetingId) return;
    setLoading(`next-${userId}`);
    try {
      await queueApi.setNextSpeaker(meetingId, userId);
      toast.success('Siguiente orador asignado.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(null);
    }
  }

  async function handleCancelRequest(requestId: string) {
    if (!meetingId) return;
    setLoading(`cancel-${requestId}`);
    try {
      await queueApi.cancel(meetingId, requestId);
      toast.success('Pedido de palabra cancelado (mano bajada).');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al bajar la mano');
    } finally {
      setLoading(null);
    }
  }

  return (
    <Card className={cn(className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Cola de oradores</CardTitle>
          {sorted.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {sorted.length}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <EmptyState
            variant="compact"
            title="Sin oradores en cola"
            description="Los participantes pueden pedir la palabra."
          />
        ) : (
          <ol className="space-y-2">
            {sorted.map((item) => {
              const isCurrent = currentSpeaker?.id === item.userId;
              const isNext = nextSpeaker?.id === item.userId;

              return (
                <li
                  key={item.id}
                  className={cn(
                    'flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                    isCurrent
                      ? 'border-primary/30 bg-primary/5'
                      : isNext
                        ? 'border-accent bg-accent/5'
                        : 'border-border bg-muted/30',
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Position circle */}
                    <span
                      className={cn(
                        'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                        isCurrent
                          ? 'bg-primary text-primary-foreground'
                          : isNext
                            ? 'bg-accent text-accent-foreground'
                            : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {item.position}
                    </span>
                    <span className={cn('font-medium truncate', isCurrent && 'text-primary')}>
                      {item.fullName}
                    </span>
                    {isCurrent && (
                      <Badge variant="default" className="text-xs shrink-0">Hablando</Badge>
                    )}
                    {isNext && !isCurrent && (
                      <Badge variant="secondary" className="text-xs shrink-0">Siguiente</Badge>
                    )}
                    {item.status && !isCurrent && !isNext && (
                      <Badge variant="outline" className="text-xs shrink-0">
                        {SPEAKING_STATUS_LABELS[item.status] ?? item.status}
                      </Badge>
                    )}
                  </div>

                  {/* Admin actions */}
                  {isAdmin && meetingId && (
                    <div className="flex items-center gap-1 shrink-0">
                      {!isCurrent && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={loading === item.userId}
                          onClick={() => handleSetCurrentSpeaker(item.userId)}
                        >
                          Dar palabra
                        </Button>
                      )}
                      {!isNext && !isCurrent && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={loading === `next-${item.userId}`}
                          onClick={() => handleSetNextSpeaker(item.userId)}
                        >
                          Siguiente
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        disabled={loading === `cancel-${item.id}`}
                        onClick={() => handleCancelRequest(item.id)}
                      >
                        Bajar mano
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
