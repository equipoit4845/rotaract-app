'use client';

import { cn } from '@/lib/utils';
import { MEETING_STATUS_ORDER, MEETING_STATUS_LABELS } from '@/lib/meeting-constants';

type MeetingStatusStepperProps = {
  currentStatus: string;
  className?: string;
};

export function MeetingStatusStepper({ currentStatus, className }: MeetingStatusStepperProps) {
  // Map PAUSED to LIVE for stepper display
  const normalizedStatus = currentStatus === 'PAUSED' ? 'LIVE' : currentStatus;
  const currentIndex = MEETING_STATUS_ORDER.indexOf(normalizedStatus as typeof MEETING_STATUS_ORDER[number]);

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {MEETING_STATUS_ORDER.map((status, i) => {
        const isCompleted = i < currentIndex;
        const isCurrent = i === currentIndex;
        const label = MEETING_STATUS_LABELS[status] ?? status;

        return (
          <div key={status} className="flex flex-1 items-center gap-1">
            <div className="flex flex-col items-center gap-1 flex-1">
              {/* Circle */}
              <div
                className={cn(
                  'flex size-7 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                  isCompleted && 'bg-success text-success-foreground',
                  isCurrent && 'bg-primary text-primary-foreground',
                  !isCompleted && !isCurrent && 'bg-muted text-muted-foreground',
                )}
              >
                {isCompleted ? '✓' : i + 1}
              </div>
              {/* Label */}
              <span
                className={cn(
                  'text-xs text-center',
                  isCurrent ? 'font-medium text-foreground' : 'text-muted-foreground',
                )}
              >
                {label}
              </span>
            </div>
            {/* Connector line */}
            {i < MEETING_STATUS_ORDER.length - 1 && (
              <div
                className={cn(
                  'h-0.5 flex-1 rounded-full -mt-5',
                  i < currentIndex ? 'bg-success' : 'bg-muted',
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
