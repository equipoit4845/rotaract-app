'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { meetingsApi } from '@/lib/api';
import { queryKeys, useMeetingsQuery } from '@/lib/queries';
import { MeetingsTable } from '@/components/MeetingsTable';
import { MeetingCard } from '@/components/meetings/MeetingCard';
import { MeetingFilters, type MeetingFiltersState } from '@/components/meetings/MeetingFilters';
import { BulkImportModal } from '@/components/bulk-import';
import { SectionHeader } from '@/components/layout/SectionHeader';
import { StatsCard } from '@/components/ui/stats-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

type Meeting = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  scheduledAt?: string | null;
  club?: { name: string };
};

export default function AdminMeetingsPage() {
  const [bulkOpen, setBulkOpen] = useState(false);
  const [filters, setFilters] = useState<MeetingFiltersState>({});
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useMeetingsQuery();
  const meetings = (data ?? []) as Meeting[];

  // Stats
  const stats = useMemo(() => {
    const s = { total: meetings.length, scheduled: 0, live: 0, finished: 0 };
    for (const m of meetings) {
      if (m.status === 'SCHEDULED') s.scheduled++;
      if (m.status === 'LIVE' || m.status === 'PAUSED') s.live++;
      if (m.status === 'FINISHED') s.finished++;
    }
    return s;
  }, [meetings]);

  // Filter
  const filtered = useMemo(() => {
    let result = meetings;
    if (filters.status) {
      result = result.filter((m) => m.status === filters.status);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter((m) => m.title.toLowerCase().includes(q));
    }
    return result;
  }, [meetings, filters]);

  // Live meeting hero
  const liveMeeting = meetings.find((m) => m.status === 'LIVE' || m.status === 'PAUSED');

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <p className="text-sm text-destructive font-medium">
            {error instanceof Error ? error.message : 'No se pudieron cargar reuniones.'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Reuniones"
        description="Gestioná las reuniones distritales y su agenda."
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setBulkOpen(true)}>
              Importar CSV
            </Button>
            <Button asChild>
              <Link href="/admin/meetings/new">Nueva reunión</Link>
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatsCard label="Total" value={stats.total} />
        <StatsCard label="Programadas" value={stats.scheduled} />
        <StatsCard label="En vivo" value={stats.live} />
        <StatsCard label="Finalizadas" value={stats.finished} />
      </div>

      {/* Live meeting hero */}
      {liveMeeting && (
        <MeetingCard
          meeting={liveMeeting}
          href={`/admin/meetings/${liveMeeting.id}/live`}
          variant="hero"
        />
      )}

      {/* Filters */}
      <MeetingFilters filters={filters} onFiltersChange={setFilters} />

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No se encontraron reuniones.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <MeetingsTable meetings={filtered} />
            </div>
          )}
        </CardContent>
      </Card>

      <BulkImportModal
        isOpen={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title="Importar reuniones"
        description="Subí un archivo CSV con la plantilla. Usá UTF-8."
        onDownloadTemplate={meetingsApi.downloadBulkTemplate}
        onImport={(file, mode) => meetingsApi.bulkImport(file, mode)}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: queryKeys.meetings })}
      />
    </div>
  );
}
