"use client";

import { formatTotalDuration } from "@/lib/format";
import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { meetingsApi, cartaPoderApi, topicsApi } from "@/lib/api";
import {
  queryKeys,
  useMeetingDetailQuery,
  useMeetingTopicsQuery,
} from "@/lib/queries";
import { MEETING_STATUS_LABELS } from "@/lib/meeting-constants";
import { MeetingStatusStepper } from "@/components/meetings/MeetingStatusStepper";
import { TopicCreateDialog } from "@/components/meetings/TopicCreateDialog";
import { TopicListSortable } from "@/components/TopicListSortable";
import { AttachmentsCard } from "@/components/attachments/AttachmentsCard";
import { ATTACHMENT_CONFIG } from "@/lib/attachment-config";
import { BulkImportModal } from "@/components/bulk-import";
import { EntityHero } from "@/components/ui/entity-hero";
import { StatStrip } from "@/components/ui/stat-strip";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/AuthContext";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

type Meeting = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  scheduledAt?: string | null;
  currentTopicId?: string | null;
  isDistrictMeeting?: boolean;
  club?: { name: string };
  participants?: {
    userId: string;
    canVote: boolean;
    user?: { fullName: string };
  }[];
};

type Topic = {
  id: string;
  title: string;
  description?: string | null;
  order: number;
  type: string;
  estimatedDurationSec?: number | null;
  status: string;
};

type CartaPoder = {
  id: string;
  meetingId: string;
  clubId: string;
  status: string;
  rejectionReason?: string | null;
  receivedAt: string;
  club?: { id: string; name: string } | null;
  delegateUser?: { id: string; fullName: string; email: string } | null;
  presidentUser?: { id: string; fullName: string; email: string } | null;
};

const CP_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  PENDING_SECRETARY: "Pendiente",
  SUBMITTED: "Enviada",
  VERIFIED: "Verificada",
  REJECTED: "Rechazada",
};

const CP_STATUS_VARIANTS: Record<
  string,
  "default" | "secondary" | "success" | "destructive" | "warning" | "outline"
> = {
  DRAFT: "secondary",
  PENDING_SECRETARY: "warning",
  SUBMITTED: "outline",
  VERIFIED: "success",
  REJECTED: "destructive",
};

export default function MeetingDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const {
    data: meetingData,
    isLoading: meetingLoading,
    error: meetingError,
  } = useMeetingDetailQuery(id);
  const { data: topicsData } = useMeetingTopicsQuery(id);
  const meeting = meetingData as Meeting | undefined;
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [actioning, setActioning] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [bulkParticipantsOpen, setBulkParticipantsOpen] = useState(false);
  const [bulkTopicsOpen, setBulkTopicsOpen] = useState(false);
  const [error, setError] = useState("");

  // Delegaciones state
  const [cartasPoder, setCartasPoder] = useState<CartaPoder[]>([]);
  const [cpLoading, setCpLoading] = useState(false);
  const [rejectDialogCp, setRejectDialogCp] = useState<CartaPoder | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [cpActioning, setCpActioning] = useState(false);

  const displayTopics = topics ?? (topicsData as Topic[] | undefined) ?? [];
  const isSecretary = user?.role === "SECRETARY" || user?.role === "SUPERADMIN";

  function handleTopicsChange(newTopics: Topic[]) {
    setTopics(newTopics);
  }

  async function refreshMeeting() {
    queryClient.invalidateQueries({ queryKey: queryKeys.meetingDetail(id) });
    queryClient.invalidateQueries({ queryKey: queryKeys.meetingTopics(id) });
  }

  const loadCartasPoder = useCallback(async () => {
    if (!isSecretary) return;
    setCpLoading(true);
    try {
      const cps = (await cartaPoderApi.list(id)) as CartaPoder[];
      setCartasPoder(cps);
    } catch {
      // Silently fail — not a critical feature
    } finally {
      setCpLoading(false);
    }
  }, [id, isSecretary]);

  useEffect(() => {
    if (id && isSecretary) loadCartasPoder();
  }, [id, isSecretary, loadCartasPoder]);

  async function doAction(fn: () => Promise<unknown>) {
    setError("");
    setActioning(true);
    try {
      await fn();
      refreshMeeting();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setActioning(false);
    }
  }

  async function handleFinish() {
    setActioning(true);
    try {
      await meetingsApi.finish(id);
      setConfirmFinish(false);
      refreshMeeting();
      toast.success("Reunión finalizada.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setActioning(false);
    }
  }

  async function handleVerifyCp(cpId: string) {
    setCpActioning(true);
    try {
      await cartaPoderApi.verify(id, cpId);
      toast.success(
        "Delegación verificada. El delegado fue habilitado para votar.",
      );
      loadCartasPoder();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setCpActioning(false);
    }
  }

  async function handleRejectCp() {
    if (!rejectDialogCp) return;
    setCpActioning(true);
    try {
      await cartaPoderApi.reject(
        id,
        rejectDialogCp.id,
        rejectReason || undefined,
      );
      toast.success("Delegación rechazada.");
      setRejectDialogCp(null);
      setRejectReason("");
      loadCartasPoder();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setCpActioning(false);
    }
  }

  if (meetingLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (meetingError && !meeting) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <p className="text-sm text-destructive font-medium">
            {meetingError instanceof Error
              ? meetingError.message
              : "Error al cargar reunión."}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!meeting) return null;

  const totalDuration = formatTotalDuration(displayTopics);
  const pendingCps = cartasPoder.filter(
    (cp) => cp.status === "PENDING_SECRETARY" || cp.status === "DRAFT",
  );

  return (
    <div className="space-y-6">
      {/* Hero */}
      <EntityHero
        title={meeting.title}
        subtitle={[
          meeting.club?.name,
          meeting.scheduledAt
            ? `Programada: ${new Date(meeting.scheduledAt).toLocaleString("es-AR", { dateStyle: "medium", timeStyle: "short" })}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        badges={<StatusBadge status={meeting.status} />}
        actions={
          <div className="flex flex-wrap gap-2">
            {meeting.status === "DRAFT" && (
              <Button
                disabled={actioning}
                onClick={() => doAction(() => meetingsApi.schedule(id))}
              >
                Programar
              </Button>
            )}
            {(meeting.status === "DRAFT" || meeting.status === "SCHEDULED") && (
              <Button
                disabled={actioning}
                onClick={() => doAction(() => meetingsApi.start(id))}
              >
                Iniciar reunión
              </Button>
            )}
            {meeting.status === "LIVE" && (
              <Button
                variant="secondary"
                disabled={actioning}
                onClick={() => doAction(() => meetingsApi.pause(id))}
              >
                Pausar
              </Button>
            )}
            {meeting.status === "PAUSED" && (
              <Button
                disabled={actioning}
                onClick={() => doAction(() => meetingsApi.resume(id))}
              >
                Reanudar
              </Button>
            )}
            {(meeting.status === "LIVE" || meeting.status === "PAUSED") && (
              <>
                <Button
                  variant="destructive"
                  disabled={actioning}
                  onClick={() => setConfirmFinish(true)}
                >
                  Finalizar
                </Button>
                <Button asChild>
                  <Link href={`/admin/meetings/${id}/live`}>
                    Ir a sala en vivo
                  </Link>
                </Button>
              </>
            )}
          </div>
        }
      />

      <MeetingStatusStepper currentStatus={meeting.status} />

      <StatStrip
        items={[
          { label: "Temas", value: displayTopics.length },
          { label: "Participantes", value: meeting.participants?.length ?? 0 },
          { label: "Duración est.", value: totalDuration },
          {
            label: "Estado",
            value: MEETING_STATUS_LABELS[meeting.status] ?? meeting.status,
          },
        ]}
      />

      {error && (
        <Card className="border-destructive">
          <CardContent className="p-4">
            <p className="text-sm text-destructive font-medium">{error}</p>
          </CardContent>
        </Card>
      )}

      {meeting.description && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">
              {meeting.description}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Delegaciones (Secretary only, district meetings) */}
      {isSecretary && meeting.isDistrictMeeting && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  Delegaciones (Cartas Poder)
                  {pendingCps.length > 0 && (
                    <Badge variant="warning" className="text-xs">
                      {pendingCps.length} pendiente
                      {pendingCps.length !== 1 ? "s" : ""}
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  Revisá las cartas poder enviadas por los presidentes de club
                  (Art. 46).
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={loadCartasPoder}
                disabled={cpLoading}
              >
                {cpLoading ? "Cargando..." : "Actualizar"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {cpLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : cartasPoder.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sin delegaciones registradas.
              </p>
            ) : (
              <ul className="space-y-2">
                {cartasPoder.map((cp) => (
                  <li
                    key={cp.id}
                    className="rounded-lg border border-border bg-muted/20 px-3 py-3 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium">
                          {cp.club?.name ?? cp.clubId}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Delegado: {cp.delegateUser?.fullName ?? "—"} (
                          {cp.delegateUser?.email})
                        </p>
                        {cp.presidentUser && (
                          <p className="text-xs text-muted-foreground">
                            Enviada por: {cp.presidentUser.fullName}
                          </p>
                        )}
                        {cp.status === "REJECTED" && cp.rejectionReason && (
                          <p className="text-xs text-destructive">
                            Motivo: {cp.rejectionReason}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={CP_STATUS_VARIANTS[cp.status] ?? "secondary"}
                        >
                          {CP_STATUS_LABELS[cp.status] ?? cp.status}
                        </Badge>
                        {(cp.status === "PENDING_SECRETARY" ||
                          cp.status === "DRAFT") && (
                          <>
                            <Button
                              size="sm"
                              variant="default"
                              disabled={cpActioning}
                              onClick={() => handleVerifyCp(cp.id)}
                            >
                              Verificar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={cpActioning}
                              onClick={() => {
                                setRejectDialogCp(cp);
                                setRejectReason("");
                              }}
                            >
                              Rechazar
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* Topics */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Temas de agenda</CardTitle>
            <CardDescription>
              Ordená los temas y marcá el actual.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBulkTopicsOpen(true)}
            >
              Importar Agenda
            </Button>
            <TopicCreateDialog
              meetingId={id}
              onCreated={(t) =>
                handleTopicsChange(
                  [...displayTopics, t].sort((a, b) => a.order - b.order),
                )
              }
            />
          </div>
        </CardHeader>
        <CardContent>
          <TopicListSortable
            meetingId={id}
            topics={displayTopics}
            currentTopicId={meeting.currentTopicId}
            canEdit
            onTopicsChange={handleTopicsChange}
            onCurrentTopicChange={refreshMeeting}
          />
        </CardContent>
      </Card>

      {/* Attachments */}
      <AttachmentsCard
        fetchKey={id}
        title="Actas / Documentos"
        list={() => meetingsApi.listAttachments(id)}
        upload={(file) => meetingsApi.uploadAttachment(id, file)}
        deleteAttachment={(attachmentId) =>
          meetingsApi.deleteAttachment(id, attachmentId)
        }
        maxFiles={ATTACHMENT_CONFIG.meeting.maxFiles}
        maxSizeBytes={ATTACHMENT_CONFIG.meeting.maxSizeMB * 1024 * 1024}
        accept={ATTACHMENT_CONFIG.meeting.accept}
        disabled={meeting.status !== "DRAFT"}
      />

      {/* Participants */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Participantes</CardTitle>
            <CardDescription>
              {meeting.participants?.length
                ? `${meeting.participants.length} asignado${meeting.participants.length === 1 ? "" : "s"}`
                : "Sin participantes asignados."}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBulkParticipantsOpen(true)}
          >
            Importar CSV
          </Button>
        </CardHeader>
        <CardContent>
          {meeting.participants?.length ? (
            <ul className="space-y-2">
              {meeting.participants.map((p) => (
                <li
                  key={p.userId}
                  className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm"
                >
                  <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {(p.user?.fullName ?? "?").charAt(0).toUpperCase()}
                  </span>
                  <span className="flex-1 font-medium">
                    {p.user?.fullName ?? p.userId}
                  </span>
                  {p.canVote && (
                    <Badge variant="outline" className="text-xs">
                      Vota
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Importá participantes desde un archivo CSV.
            </p>
          )}

          <BulkImportModal
            isOpen={bulkParticipantsOpen}
            onClose={() => setBulkParticipantsOpen(false)}
            title="Importar participantes"
            description="Subí un archivo CSV con emails de usuarios existentes. Usá UTF-8."
            onDownloadTemplate={() =>
              meetingsApi.downloadParticipantsBulkTemplate(id)
            }
            onImport={(file, mode) =>
              meetingsApi.bulkImportParticipants(id, file, mode)
            }
            onSuccess={refreshMeeting}
          />

          <BulkImportModal
            isOpen={bulkTopicsOpen}
            onClose={() => setBulkTopicsOpen(false)}
            title="Importar temas de la agenda"
            description="Subí un archivo CSV o Excel (.xlsx) con los temas de la reunión."
            onDownloadTemplate={() => topicsApi.downloadBulkTemplate(id)}
            onImport={(file, mode) => topicsApi.bulkImport(id, file, mode)}
            onSuccess={refreshMeeting}
          />
        </CardContent>
      </Card>

      {/* Confirm finish dialog */}
      <Dialog open={confirmFinish} onOpenChange={setConfirmFinish}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalizar reunión</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que querés finalizar la reunión? Esta acción no
              se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmFinish(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={actioning}
              onClick={handleFinish}
            >
              {actioning ? "Finalizando..." : "Finalizar reunión"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject carta poder dialog */}
      <Dialog
        open={!!rejectDialogCp}
        onOpenChange={(open) => {
          if (!open) {
            setRejectDialogCp(null);
            setRejectReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechazar delegación</DialogTitle>
            <DialogDescription>
              Club: {rejectDialogCp?.club?.name ?? rejectDialogCp?.clubId} →{" "}
              Delegado: {rejectDialogCp?.delegateUser?.fullName ?? "—"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">Motivo del rechazo (opcional)</Label>
            <Input
              id="reject-reason"
              placeholder="Ej: Documentación incompleta"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogCp(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={cpActioning}
              onClick={handleRejectCp}
            >
              {cpActioning ? "Rechazando..." : "Rechazar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
