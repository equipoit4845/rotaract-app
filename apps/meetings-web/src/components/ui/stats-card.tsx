import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

type StatsCardProps = {
  label: string;
  value: string | number;
  subValue?: string;
  icon?: React.ReactNode;
  href?: string;
  variant?: 'default' | 'muted';
  className?: string;
};

export function StatsCard({
  label,
  value,
  subValue,
  icon,
  href,
  variant = 'default',
  className,
}: StatsCardProps) {
  const content = (
    <>
      {icon && (
        <div className="mb-2 flex size-9 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground [&>svg]:size-5">
          {icon}
        </div>
      )}
      <p className="text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      <p className="mt-0.5 text-sm font-medium text-muted-foreground">{label}</p>
      {subValue && (
        <p className="mt-1 text-xs text-muted-foreground">{subValue}</p>
      )}
    </>
  );

  const wrapperClass = cn(
    'rounded-xl border border-border bg-card px-4 py-4 shadow-sm transition-colors',
    variant === 'muted' && 'bg-muted/30',
    href && 'hover:border-primary/30 hover:bg-muted/30',
    className
  );

  if (href) {
    return (
      <Link href={href} className={cn('block', wrapperClass)}>
        {content}
      </Link>
    );
  }

  return <div className={wrapperClass}>{content}</div>;
}
