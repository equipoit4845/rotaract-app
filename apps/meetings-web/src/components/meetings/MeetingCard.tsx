'use client';

import Link from 'next/link';
import { StatusBadge } from '@/components/ui/status-badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Meeting = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  scheduledAt?: string | null;
  club?: { name: string };
};

type MeetingCardProps = {
  meeting: Meeting;
  href: string;
  variant?: 'default' | 'hero';
  className?: string;
};

export function MeetingCard({ meeting, href, variant = 'default', className }: MeetingCardProps) {
  const isLive = meeting.status === 'LIVE';

  if (variant === 'hero') {
    return (
      <Card className={cn('border-primary/30 bg-primary/5', className)}>
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {isLive && (
                  <span className="size-2 rounded-full bg-success animate-pulse" />
                )}
                <StatusBadge status={meeting.status} />
              </div>
              <h3 className="text-lg font-semibold">{meeting.title}</h3>
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                {meeting.club?.name && <span>{meeting.club.name}</span>}
                {meeting.scheduledAt && (
                  <span>
                    {new Date(meeting.scheduledAt).toLocaleString('es-AR', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </span>
                )}
              </div>
            </div>
            <Button asChild>
              <Link href={href}>
                {isLive ? 'Entrar' : 'Ver detalle'}
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Link href={href} className="block">
      <Card
        className={cn(
          'transition-all hover:border-primary/50 hover:shadow-sm',
          isLive && 'border-l-4 border-l-primary',
          className,
        )}
      >
        <CardContent className="flex items-center justify-between gap-3 p-4">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2">
              {isLive && (
                <span className="size-2 shrink-0 rounded-full bg-success animate-pulse" />
              )}
              <h3 className="font-medium truncate">{meeting.title}</h3>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {meeting.club?.name && <span>{meeting.club.name}</span>}
              {meeting.scheduledAt && (
                <span>
                  {new Date(meeting.scheduledAt).toLocaleString('es-AR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </span>
              )}
            </div>
          </div>
          <StatusBadge status={meeting.status} size="sm" />
        </CardContent>
      </Card>
    </Link>
  );
}
