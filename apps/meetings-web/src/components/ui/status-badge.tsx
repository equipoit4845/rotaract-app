import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type BadgeVariant =
  | 'default'
  | 'secondary'
  | 'destructive'
  | 'outline'
  | 'success'
  | 'warning'
  | 'info';

type StatusMapping = {
  label: string;
  variant: BadgeVariant;
};

/** Mapeo de status comunes a label y variant semántica */
const STATUS_MAP: Record<string, StatusMapping> = {
  // Informes
  DRAFT: { label: 'Borrador', variant: 'secondary' },
  SUBMITTED: { label: 'Enviado', variant: 'success' },
  OBSERVED: { label: 'Observado', variant: 'warning' },
  APPROVED: { label: 'Aprobado', variant: 'success' },
  REJECTED: { label: 'Rechazado', variant: 'destructive' },
  // Proyectos
  IDEA: { label: 'Idea', variant: 'secondary' },
  PLANIFICACION: { label: 'Planificación', variant: 'info' },
  EN_EJECUCION: { label: 'En ejecución', variant: 'default' },
  FINALIZADO: { label: 'Finalizado', variant: 'success' },
  CANCELADO: { label: 'Cancelado', variant: 'destructive' },
  // Socios
  ACTIVE: { label: 'Activo', variant: 'success' },
  INACTIVE: { label: 'Inactivo', variant: 'secondary' },
  LICENCIA: { label: 'Licencia', variant: 'outline' },
  EGRESADO: { label: 'Egresado', variant: 'secondary' },
  PENDIENTE: { label: 'Pendiente', variant: 'warning' },
  // Reuniones
  SCHEDULED: { label: 'Programada', variant: 'info' },
  LIVE: { label: 'En vivo', variant: 'success' },
  PAUSED: { label: 'Pausada', variant: 'warning' },
  FINISHED: { label: 'Finalizada', variant: 'secondary' },
  ARCHIVED: { label: 'Archivada', variant: 'secondary' },
  // Oportunidades / Eventos
  PUBLISHED: { label: 'Publicado', variant: 'success' },
  CANCELLED: { label: 'Cancelado', variant: 'destructive' },
};

type StatusBadgeProps = {
  status: string;
  label?: string;
  size?: 'sm' | 'default';
  className?: string;
};

/**
 * Badge semántico que mapea status a label y variant.
 * Usar en tablas, cards y listados.
 */
export function StatusBadge({
  status,
  label,
  size = 'default',
  className,
}: StatusBadgeProps) {
  const mapping = STATUS_MAP[status];
  const displayLabel = label ?? mapping?.label ?? status;
  const variant = mapping?.variant ?? 'outline';

  return (
    <Badge
      variant={variant as 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info'}
      className={cn(size === 'sm' && 'h-4 px-1.5 text-[10px]', className)}
    >
      {displayLabel}
    </Badge>
  );
}
