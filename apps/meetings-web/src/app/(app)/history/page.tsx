'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { historyApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

type Meeting = { id: string; title: string; status: string; scheduledAt?: string | null };

export default function HistoryPage() {
  const { user } = useAuth();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    historyApi
      .meetings()
      .then((m) => setMeetings(m as Meeting[]))
      .finally(() => setLoading(false));
  }, []);

  if (!user) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Historial de reuniones</CardTitle>
        <CardDescription>
          Reuniones en las que participaste o que ya finalizaron.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : meetings.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay reuniones en el historial.</p>
        ) : (
          <ul className="space-y-2 list-none p-0 m-0">
            {meetings.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2 text-sm"
              >
                <Button variant="link" className="p-0 h-auto font-medium" asChild>
                  <Link href={`/history/${m.id}`}>{m.title}</Link>
                </Button>
                <span className="text-muted-foreground text-xs shrink-0">{m.status}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
