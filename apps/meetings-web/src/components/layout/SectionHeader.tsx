import * as React from 'react';
import { cn } from '@/lib/utils';

type SectionHeaderProps = {
  title: string;
  description?: string;
  action?: React.ReactNode;
  size?: 'sm' | 'default' | 'lg';
  className?: string;
};

const sizeClasses = {
  sm: 'gap-0.5',
  default: 'gap-1',
  lg: 'gap-1.5',
};

const titleClasses = {
  sm: 'text-base font-semibold',
  default: 'text-lg font-semibold',
  lg: 'text-xl font-semibold',
};

export function SectionHeader({
  title,
  description,
  action,
  size = 'default',
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row sm:items-center sm:justify-between',
        sizeClasses[size],
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <h2 className={cn('text-foreground', titleClasses[size])}>{title}</h2>
        {description && (
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action && (
        <div className="mt-2 shrink-0 sm:mt-0 sm:ml-4">{action}</div>
      )}
    </div>
  );
}
