'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { historyApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type AuditItem = { action: string; createdAt: string };

type AuditSidebarProps = {
  meetingId: string;
  defaultOpen?: boolean;
  /** En desktop: mostrar como sidebar. En móvil: sección colapsable */
  className?: string;
};

export function AuditSidebar({
  meetingId,
  defaultOpen = true,
  className,
}: AuditSidebarProps) {
  const [open, setOpen] = useState(defaultOpen);

  const { data: audit = [], isLoading } = useQuery({
    queryKey: ['audit', meetingId],
    queryFn: () => historyApi.audit(meetingId) as Promise<AuditItem[]>,
    enabled: !!meetingId,
  });

  return (
    <div className={cn('lg:w-80 lg:shrink-0', className)}>
      <Card>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Auditoría</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
            >
              {open ? 'Ocultar' : 'Mostrar'}
            </Button>
          </div>
        </CardHeader>
        <div className={cn('lg:block', !open && 'hidden')}>
          <CardContent className="pt-0">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Cargando...</p>
            ) : audit.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin eventos.</p>
            ) : (
              <ul className="space-y-2 text-sm max-h-[400px] overflow-auto">
                {audit.map((a, i) => (
                  <li
                    key={i}
                    className="flex flex-col gap-0.5 rounded-md border border-border px-3 py-2"
                  >
                    <span>{a.action}</span>
                    <span className="text-muted-foreground text-xs">
                      {new Date(a.createdAt).toLocaleString('es-AR')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </div>
      </Card>
    </div>
  );
}
