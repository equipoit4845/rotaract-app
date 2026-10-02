'use client';

import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Meeting = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  scheduledAt?: string | null;
  club?: { name: string };
};

export function MeetingsTable({
  meetings,
  detailHref = (id) => `/admin/meetings/${id}`,
}: {
  meetings: Meeting[];
  detailHref?: (id: string) => string;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Título</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Fecha</TableHead>
          <TableHead>Club</TableHead>
          <TableHead className="w-[80px]"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {meetings.map((m) => (
          <TableRow
            key={m.id}
            className={cn(m.status === 'LIVE' && 'border-l-4 border-l-primary')}
          >
            <TableCell className="font-medium">{m.title}</TableCell>
            <TableCell>
              <StatusBadge status={m.status} />
            </TableCell>
            <TableCell className="text-muted-foreground">
              {m.scheduledAt
                ? new Date(m.scheduledAt).toLocaleString('es-AR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })
                : '—'}
            </TableCell>
            <TableCell className="text-muted-foreground">{m.club?.name ?? '—'}</TableCell>
            <TableCell>
              <Button variant="ghost" size="sm" asChild>
                <Link href={detailHref(m.id)}>Ver</Link>
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
