import * as React from 'react';
import { cn } from '@/lib/utils';

type EntityHeroProps = {
  title: string;
  subtitle?: string;
  badges?: React.ReactNode;
  image?: React.ReactNode;
  actions?: React.ReactNode;
  size?: 'sm' | 'lg';
  className?: string;
};

/**
 * Hero de entidad para club, perfil u otras entidades principales.
 * Muestra identidad visual, badges de estado y acciones.
 */
export function EntityHero({
  title,
  subtitle,
  badges,
  image,
  actions,
  size = 'lg',
  className,
}: EntityHeroProps) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-border bg-card shadow-sm',
        size === 'lg' && 'px-5 py-5',
        size === 'sm' && 'px-4 py-4',
        className
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          {image && (
            <div className="shrink-0">{image}</div>
          )}
          <div className="min-w-0 flex-1">
            <h1
              className={cn(
                'font-semibold text-foreground',
                size === 'lg' ? 'text-2xl tracking-tight' : 'text-xl'
              )}
            >
              {title}
            </h1>
            {subtitle && (
              <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
            )}
            {badges && (
              <div className="mt-3 flex flex-wrap gap-2">{badges}</div>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
        )}
      </div>
    </div>
  );
}
