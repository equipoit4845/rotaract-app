import * as React from 'react';
import { cn } from '@/lib/utils';
import { FileQuestion } from 'lucide-react';

type EmptyStateProps = {
  /** Título principal */
  title: string;
  /** Descripción opcional debajo del título */
  description?: string;
  /** Icono opcional (48px en default, oculto en compact) */
  icon?: React.ReactNode;
  /** Acción principal (ej: Button con Link) */
  action?: React.ReactNode;
  /** Acciones secundarias */
  secondaryActions?: React.ReactNode;
  variant?: 'default' | 'compact';
  className?: string;
};

/**
 * Estado vacío unificado para listados y secciones.
 * Uso: <EmptyState title="No hay informes" description="Creá uno para empezar" action={<Button asChild><Link href="/nuevo">Crear informe</Link></Button>} />
 */
export function EmptyState({
  title,
  description,
  icon,
  action,
  secondaryActions,
  variant = 'default',
  className,
}: EmptyStateProps) {
  const IconWrapper = icon ?? <FileQuestion className="size-12 text-muted-foreground/60" />;

  if (variant === 'compact') {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/20 px-4 py-6 text-center',
          className
        )}
      >
        <p className="font-medium text-foreground">{title}</p>
        {description && (
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        )}
        {(action || secondaryActions) && (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            {action}
            {secondaryActions}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/20 px-6 py-12 text-center',
        className
      )}
    >
      <div className="mb-4 flex size-12 items-center justify-center [&>svg]:size-12 [&>svg]:text-muted-foreground/60">
        {IconWrapper}
      </div>
      <p className="font-medium text-foreground">{title}</p>
      {description && (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      )}
      {(action || secondaryActions) && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryActions}
        </div>
      )}
    </div>
  );
}
