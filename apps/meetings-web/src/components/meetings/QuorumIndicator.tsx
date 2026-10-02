'use client';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

type QuorumIndicatorProps = {
  required: number;
  present: number;
  met: boolean;
  isInformationalOnly: boolean;
  className?: string;
};

export function QuorumIndicator({
  required,
  present,
  met,
  isInformationalOnly,
  className,
}: QuorumIndicatorProps) {
  const progress = required > 0 ? Math.min(1, present / required) : 0;

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Quórum</span>
        <div className="flex items-center gap-2">
          <span className="tabular-nums font-medium">
            {present} de {required} clubes
          </span>
          <Badge variant={met ? 'success' : 'warning'} className="text-xs">
            {met ? 'Alcanzado' : 'Sin quórum'}
          </Badge>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            met ? 'bg-success' : progress > 0.5 ? 'bg-warning' : 'bg-destructive',
          )}
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      {/* Informational warning */}
      {isInformationalOnly && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
          Sin quórum — Reunión informativa. No se pueden tomar decisiones (Art. 42).
        </div>
      )}
    </div>
  );
}
