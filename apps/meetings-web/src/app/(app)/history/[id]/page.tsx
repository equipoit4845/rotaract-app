'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { historyApi, actaApi } from '@/lib/api';
import { AuditSidebar } from '@/components/AuditSidebar';
import { ActaEditor } from '@/components/meetings/ActaEditor';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

const ADMIN_ROLES = ['SECRETARY', 'PRESIDENT', 'RDR'];

type VoteSession = {
  id: string;
  topicId: string;
  topicTitle?: string;
  status: string;
  openedAt: string;
  closedAt?: string;
};

type Acta = {
  id: string;
  status: string;
  contentJson: string;
  publishedAt?: string;
};

export default function HistoryMeetingPage() {
  const params = useParams();
  const id = params.id as string;
  const { user } = useAuth();
  const [meeting, setMeeting] = useState<{ title: string; status: string } | null>(null);
  const [voteSessions, setVoteSessions] = useState<VoteSession[]>([]);
  const [acta, setActa] = useState<Acta | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [generatingActa, setGeneratingActa] = useState(false);
  const isAdmin = user && ADMIN_ROLES.includes(user.role);
  const isSecretary = user?.role === 'SECRETARY';

  async function loadData() {
    if (!id || !user) return;
    try {
      const m = await historyApi.meeting(id);
      setMeeting(m as { title: string; status: string } | null);
      if (ADMIN_ROLES.includes(user.role)) {
        try {
          const vs = await historyApi.voteSessions(id);
          setVoteSessions(vs as VoteSession[]);
        } catch {
          setVoteSessions([]);
        }
      }
      // Load acta
      try {
        const a = await actaApi.get(id);
        setActa(a as Acta | null);
      } catch {
        setActa(null);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user]);

  async function handleExportCsv() {
    setExporting(true);
    try {
      await historyApi.downloadCsv(id);
      toast.success('Descarga iniciada.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al exportar.');
    } finally {
      setExporting(false);
    }
  }

  async function handleGenerateActa() {
    setGeneratingActa(true);
    try {
      const a = await actaApi.generate(id);
      setActa(a as Acta);
      toast.success('Acta generada.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al generar acta.');
    } finally {
      setGeneratingActa(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex-1 space-y-6">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
        <AuditSidebar meetingId={id} />
      </div>
    );
  }

  if (!meeting) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">No encontrado.</p>
        </CardContent>
      </Card>
    );
  }

  const isFinished = meeting.status === 'FINISHED' || meeting.status === 'ARCHIVED';

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <div className="min-w-0 flex-1 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{meeting.title}</CardTitle>
            <CardDescription>Detalle y auditoría de la reunión.</CardDescription>
          </CardHeader>
        </Card>

        {/* Acta section */}
        {isFinished && acta && (
          <ActaEditor
            meetingId={id}
            acta={acta}
            canEdit={!!isSecretary}
            onUpdated={loadData}
          />
        )}

        {isFinished && !acta && isSecretary && (
          <Card>
            <CardContent className="p-6 text-center space-y-3">
              <p className="text-sm text-muted-foreground">
                No se generó acta para esta reunión.
              </p>
              <Button disabled={generatingActa} onClick={handleGenerateActa}>
                {generatingActa ? 'Generando...' : 'Generar acta'}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Votes section */}
        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle>Votaciones</CardTitle>
              <CardDescription>Sesiones de votación de esta reunión.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {voteSessions.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin votaciones.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {voteSessions.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between gap-4 rounded-md border border-border px-3 py-2"
                    >
                      <span>{s.topicTitle ?? s.topicId}</span>
                      <span className="text-muted-foreground text-xs">
                        {new Date(s.openedAt).toLocaleString('es-AR')} — {s.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <Button
                size="lg"
                disabled={exporting || voteSessions.length === 0}
                onClick={handleExportCsv}
              >
                {exporting ? 'Exportando...' : 'Exportar CSV'}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
      <AuditSidebar meetingId={id} />
    </div>
  );
}
