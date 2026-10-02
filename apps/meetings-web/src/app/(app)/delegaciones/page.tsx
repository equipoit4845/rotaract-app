'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { meetingsApi, cartaPoderApi, clubsApi } from '@/lib/api';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

type Meeting = { id: string; title: string; scheduledAt: string | null; status: string; isDistrictMeeting?: boolean };
type CartaPoder = {
  id: string;
  meetingId: string;
  clubId: string;
  status: string;
  delegateUser?: { id: string; fullName: string; email: string } | null;
  presidentUser?: { id: string; fullName: string; email: string } | null;
  rejectionReason?: string | null;
};
type User = { id: string; fullName: string; email: string; role: string };

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  PENDING_SECRETARY: 'Pendiente de aprobación',
  SUBMITTED: 'Enviada',
  VERIFIED: 'Verificada',
  REJECTED: 'Rechazada',
};

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'success' | 'destructive' | 'warning' | 'outline'> = {
  DRAFT: 'secondary',
  PENDING_SECRETARY: 'warning',
  SUBMITTED: 'outline',
  VERIFIED: 'success',
  REJECTED: 'destructive',
};

export default function DelegacionesPage() {
  const { user } = useAuth();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [cartasPoder, setCartasPoder] = useState<Record<string, CartaPoder[]>>({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [delegateSearch, setDelegateSearch] = useState('');
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [selectedDelegate, setSelectedDelegate] = useState<User | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Legacy took memberships[0]; prefer the club this person presides.
  const primaryMembership = user?.memberships?.find((m) => m.isPresident) ?? user?.memberships?.[0];
  const clubId = primaryMembership?.clubId;

  const loadMeetings = useCallback(async () => {
    if (!clubId) return;
    setLoading(true);
    try {
      const all = (await meetingsApi.list()) as Meeting[];
      const district = all.filter((m) => m.isDistrictMeeting && m.status !== 'FINISHED' && m.status !== 'ARCHIVED');
      setMeetings(district);

      // Load cartas poder for each meeting
      const cpMap: Record<string, CartaPoder[]> = {};
      await Promise.all(
        district.map(async (m) => {
          try {
            const cps = (await cartaPoderApi.listMyClub(m.id, clubId)) as CartaPoder[];
            cpMap[m.id] = cps;
          } catch {
            cpMap[m.id] = [];
          }
        }),
      );
      setCartasPoder(cpMap);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cargar reuniones');
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  useEffect(() => {
    loadMeetings();
  }, [loadMeetings]);

  async function openDialog(meeting: Meeting) {
    setSelectedMeeting(meeting);
    setDelegateSearch('');
    setSelectedDelegate(null);
    setDialogOpen(true);
    if (allUsers.length === 0) {
      setUsersLoading(true);
      try {
        const members = clubId ? await clubsApi.members(clubId) : [];
        setAllUsers(members.map((m) => ({ ...m, role: 'PARTICIPANT' })));
      } catch {
        toast.error('No se pudo cargar la lista de socios del club');
      } finally {
        setUsersLoading(false);
      }
    }
  }

  const filteredUsers = allUsers.filter(
    (u) =>
      u.id !== user?.id &&
      (u.fullName.toLowerCase().includes(delegateSearch.toLowerCase()) ||
        u.email.toLowerCase().includes(delegateSearch.toLowerCase())),
  ).slice(0, 8);

  async function handleSubmit() {
    if (!selectedMeeting || !selectedDelegate || !clubId) return;
    setSubmitting(true);
    try {
      await cartaPoderApi.create(selectedMeeting.id, {
        clubId,
        delegateUserId: selectedDelegate.id,
      });
      toast.success('Delegación enviada. El Secretario Distrital la revisará.');
      setDialogOpen(false);
      await loadMeetings();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al crear delegación');
    } finally {
      setSubmitting(false);
    }
  }

  if (!user || user.role !== 'PRESIDENT') {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">Solo los presidentes de club pueden gestionar delegaciones.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Delegaciones (Cartas Poder)</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Delegá tu voto en las reuniones distritales a otro socio (Art. 46).
          Las cartas poder digitales deben enviarse mínimo 7 días antes.
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      ) : meetings.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">No hay reuniones distritales próximas.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {meetings.map((m) => {
            const cps = cartasPoder[m.id] ?? [];
            const activeCp = cps[0];
            return (
              <Card key={m.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">{m.title}</CardTitle>
                      <CardDescription>
                        {m.scheduledAt
                          ? new Date(m.scheduledAt).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' })
                          : 'Fecha por confirmar'}
                      </CardDescription>
                    </div>
                    {activeCp ? (
                      <Badge variant={STATUS_VARIANTS[activeCp.status] ?? 'secondary'}>
                        {STATUS_LABELS[activeCp.status] ?? activeCp.status}
                      </Badge>
                    ) : (
                      <Badge variant="outline">Sin delegación</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  {activeCp ? (
                    <div className="text-sm space-y-1">
                      <p className="text-muted-foreground">
                        Delegado: <span className="font-medium text-foreground">{activeCp.delegateUser?.fullName ?? '—'}</span>
                        {' '}<span className="text-muted-foreground">({activeCp.delegateUser?.email})</span>
                      </p>
                      {activeCp.status === 'REJECTED' && activeCp.rejectionReason && (
                        <p className="text-destructive text-xs">Motivo: {activeCp.rejectionReason}</p>
                      )}
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openDialog(m)}
                      disabled={m.status === 'FINISHED' || m.status === 'LIVE'}
                    >
                      Crear delegación
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create delegation dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Crear delegación</DialogTitle>
            <DialogDescription>
              {selectedMeeting?.title} —{' '}
              {selectedMeeting?.scheduledAt
                ? new Date(selectedMeeting.scheduledAt).toLocaleDateString('es-AR', { dateStyle: 'long' })
                : 'Fecha por confirmar'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Buscar delegado</Label>
              <Input
                placeholder="Nombre o email del socio..."
                value={delegateSearch}
                onChange={(e) => {
                  setDelegateSearch(e.target.value);
                  if (selectedDelegate) setSelectedDelegate(null);
                }}
                autoFocus
              />
              {usersLoading && (
                <p className="text-xs text-muted-foreground">Cargando socios...</p>
              )}
              {delegateSearch.length >= 2 && !selectedDelegate && (
                <div className="rounded-lg border border-border overflow-hidden">
                  {filteredUsers.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground">Sin resultados</p>
                  ) : (
                    filteredUsers.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2 border-b border-border last:border-0"
                        onClick={() => {
                          setSelectedDelegate(u);
                          setDelegateSearch(u.fullName);
                        }}
                      >
                        <div className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary shrink-0">
                          {u.fullName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium">{u.fullName}</p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {selectedDelegate && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                <p className="font-medium">Delegado seleccionado:</p>
                <p>{selectedDelegate.fullName} ({selectedDelegate.email})</p>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Al confirmar, la delegación quedará pendiente de aprobación por el Secretario Distrital.
              Las cartas poder deben enviarse con al menos 7 días de anticipación (Art. 46).
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!selectedDelegate || submitting}
              onClick={handleSubmit}
            >
              {submitting ? 'Enviando...' : 'Enviar delegación'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
