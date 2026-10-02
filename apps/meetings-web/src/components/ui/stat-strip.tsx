import * as React from 'react';
import { cn } from '@/lib/utils';

type StatItem = {
  label: string;
  value: string | number;
};

type StatStripProps = {
  items: StatItem[];
  className?: string;
};

export function StatStrip({ items, className }: StatStripProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap gap-6 rounded-xl border border-border bg-muted/20 px-4 py-3',
        className
      )}
    >
      {items.map((item, i) => (
        <div key={i} className="flex flex-col gap-0.5">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {item.label}
          </span>
          <span className="text-lg font-semibold tabular-nums text-foreground">
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}
