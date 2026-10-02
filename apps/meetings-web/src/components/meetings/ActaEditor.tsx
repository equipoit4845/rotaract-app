'use client';

import { useState } from 'react';
import { actaApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { TOPIC_TYPE_LABELS, MAJORITY_TYPE_LABELS } from '@/lib/meeting-constants';
import { cn } from '@/lib/utils';

type ActaContent = {
  header: {
    title: string;
    date: string | null;
    startedAt: string | null;
    endedAt: string | null;
    type: string;
    quorumRequired: number | null;
    quorumMet: boolean;
    isInformationalOnly: boolean;
    club: string | null;
  };
  attendance: {
    clubs: { name: string; representative: string; isDelegate: boolean }[];
    absent: string[];
  };
  topics: {
    order: number;
    title: string;
    type: string;
    summary: string;
    vote?: {
      method: string;
      majority: string;
      yes: number;
      no: number;
      abstain: number;
      total: number;
      approved: boolean | null;
      rdrTiebreaker: boolean;
      ballotType?: string;
      electionType?: string | null;
      options?: string[];
      candidates?: { name: string; votes: number }[];
      detailedVotes?: { clubName: string; choice: string; candidateName?: string | null }[];
    };
  }[];
  motions?: {
    id: string;
    title: string;
    description: string | null;
    proposedByClubName: string;
    secondedByClubName: string | null;
    status: string;
  }[];
  resolutions: { number: number; text: string; approved: boolean }[];
  observations: string;
  closingNotes: string;
};

type ActaEditorProps = {
  meetingId: string;
  acta: { id: string; status: string; contentJson: string; publishedAt?: string };
  canEdit: boolean;
  onUpdated?: () => void;
};

export function ActaEditor({ meetingId, acta, canEdit, onUpdated }: ActaEditorProps) {
  const [content, setContent] = useState<ActaContent>(() => JSON.parse(acta.contentJson));
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [autocompleting, setAutocompleting] = useState(false);

  const isPublished = acta.status === 'PUBLISHED';
  const editable = canEdit && !isPublished;

  function updateContent(patch: Partial<ActaContent>) {
    setContent((prev) => ({ ...prev, ...patch }));
  }

  function updateTopicSummary(index: number, summary: string) {
    setContent((prev) => ({
      ...prev,
      topics: prev.topics.map((t, i) => (i === index ? { ...t, summary } : t)),
    }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await actaApi.update(meetingId, JSON.stringify(content));
      toast.success('Acta guardada.');
      onUpdated?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar.');
    } finally {
      setSaving(false);
    }
  }

  async function handleAutocompleteAI() {
    setAutocompleting(true);
    try {
      const res: any = await actaApi.autocompleteAI(meetingId);
      const updatedContent = JSON.parse(res.contentJson);
      setContent(updatedContent);
      toast.success('Acta autocompletada con IA con éxito.');
      onUpdated?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al autocompletar con IA.');
    } finally {
      setAutocompleting(false);
    }
  }

  async function handlePublish() {
    setPublishing(true);
    try {
      await actaApi.publish(meetingId);
      toast.success('Acta publicada.');
      setConfirmPublish(false);
      onUpdated?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al publicar.');
    } finally {
      setPublishing(false);
    }
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      await actaApi.downloadPdf(meetingId);
      toast.success('Descarga iniciada.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al descargar.');
    } finally {
      setDownloading(false);
    }
  }

  const h = content.header;
  const typeLabel = h.type === 'ORDINARY' ? 'Ordinaria' : 'Extraordinaria';

  return (
    <div className="space-y-6">
      {/* Status + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Acta de Reunión</h2>
          <Badge variant={isPublished ? 'success' : 'secondary'}>
            {isPublished ? 'Publicada' : 'Borrador'}
          </Badge>
        </div>
        <div className="flex gap-2">
          {editable && (
            <>
              <Button variant="outline" disabled={saving || autocompleting} onClick={handleAutocompleteAI}>
                {autocompleting ? 'Autocompletando...' : '✨ Autocompletar con IA'}
              </Button>
              <Button variant="outline" disabled={saving} onClick={handleSave}>
                {saving ? 'Guardando...' : 'Guardar borrador'}
              </Button>
              <Button onClick={() => setConfirmPublish(true)}>
                Publicar acta
              </Button>
            </>
          )}
          <Button variant="outline" disabled={downloading} onClick={handleDownload}>
            {downloading ? 'Descargando...' : 'Descargar PDF'}
          </Button>
        </div>
      </div>

      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle>{h.title}</CardTitle>
          <CardDescription>
            Reunión {typeLabel}
            {h.date && ` — ${new Date(h.date).toLocaleDateString('es-AR', { dateStyle: 'long' })}`}
            {h.club && ` — ${h.club}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm space-y-1 text-muted-foreground">
          {h.startedAt && h.endedAt && (
            <p>
              Horario: {new Date(h.startedAt).toLocaleTimeString('es-AR', { timeStyle: 'short' })}
              {' — '}
              {new Date(h.endedAt).toLocaleTimeString('es-AR', { timeStyle: 'short' })}
            </p>
          )}
          <p>
            Quórum: {h.quorumMet ? 'Alcanzado' : 'No alcanzado'}
            {h.quorumRequired && ` (${h.quorumRequired} requeridos)`}
          </p>
          {h.isInformationalOnly && (
            <p className="text-warning font-medium">Reunión informativa — Sin quórum</p>
          )}
        </CardContent>
      </Card>

      {/* Attendance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Asistencia</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-3">
          {content.attendance.clubs.length > 0 && (
            <div>
              <p className="font-medium mb-1">Clubes presentes ({content.attendance.clubs.length})</p>
              <ul className="space-y-1">
                {content.attendance.clubs.map((c, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span>• {c.name} — {c.representative}</span>
                    {c.isDelegate && <Badge variant="outline" className="text-xs">Delegado</Badge>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {content.attendance.absent.length > 0 && (
            <div>
              <p className="font-medium mb-1 text-muted-foreground">Ausentes ({content.attendance.absent.length})</p>
              <p className="text-muted-foreground">{content.attendance.absent.join(', ')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Topics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Orden del Día</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {content.topics.map((topic, i) => (
            <div key={i} className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{topic.order}. {topic.title}</span>
                <StatusBadge
                  status={topic.type}
                  label={TOPIC_TYPE_LABELS[topic.type] ?? topic.type}
                  size="sm"
                />
              </div>
              {topic.vote && (
                <div className="text-xs space-y-1 rounded-md bg-muted/30 p-2 border border-border/30">
                  <p className="text-muted-foreground font-medium mb-1">
                    Votación {topic.vote.method === 'SECRET' ? 'Secreta' : 'Pública'}
                    {' '}({MAJORITY_TYPE_LABELS[topic.vote.majority] ?? topic.vote.majority})
                  </p>

                  {topic.vote.electionType && (
                    <div className="text-xs pb-1 mb-1 border-b border-border/20 text-muted-foreground">
                      <span className="font-semibold text-foreground">
                        {topic.vote.electionType === 'RDR' ? 'Elección de RDR' : 'Elección de Sede'}:
                      </span>{' '}
                      {topic.vote.options && topic.vote.options.length > 0
                        ? topic.vote.options.join(', ')
                        : 'Sin opciones registradas'}
                    </div>
                  )}
                  
                  {topic.vote.ballotType === 'CANDIDATE' && topic.vote.candidates ? (
                    <div className="space-y-1 py-1">
                      <p className="font-semibold text-foreground">Resultados de Elección:</p>
                      <ul className="list-disc list-inside pl-1 space-y-0.5 text-muted-foreground">
                        {topic.vote.candidates.map((c, idx) => (
                          <li key={idx}>
                            {c.name}: <span className="font-medium text-foreground">{c.votes} votos</span>
                          </li>
                        ))}
                      </ul>
                      <p className="text-muted-foreground">Abstención: {topic.vote.abstain} | Total emitidos: {topic.vote.total}</p>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">
                      A favor: <span className="font-medium text-foreground">{topic.vote.yes}</span> | 
                      En contra: <span className="font-medium text-foreground">{topic.vote.no}</span> | 
                      Abstención: <span className="font-medium text-foreground">{topic.vote.abstain}</span>
                    </p>
                  )}

                  <div className="flex items-center gap-2 mt-1">
                    {topic.vote.approved !== null && (
                      <Badge variant={topic.vote.approved ? 'success' : 'destructive'} className="text-[10px] px-1 py-0 h-4">
                        {topic.vote.approved ? 'Aprobada' : 'Rechazada'}
                      </Badge>
                    )}
                    {topic.vote.rdrTiebreaker && (
                      <span className="text-muted-foreground text-[10px] italic">Desempate por el RDR (Art. 49)</span>
                    )}
                  </div>

                  {topic.vote.method === 'PUBLIC' && topic.vote.detailedVotes && topic.vote.detailedVotes.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-border/40 space-y-1">
                      <p className="font-semibold text-foreground text-[10px]">Desglose de Votos:</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 text-[10px]">
                        {topic.vote.detailedVotes.map((dv, idx) => {
                          const choiceLabel = dv.choice === 'YES' ? 'A favor' : dv.choice === 'NO' ? 'En contra' : dv.choice === 'ABSTAIN' ? 'Abstención' : dv.choice;
                          const candidateLabel = dv.candidateName ? ` (${dv.candidateName})` : '';
                          const choiceColor = dv.choice === 'YES' ? 'text-success' : dv.choice === 'NO' ? 'text-destructive' : 'text-muted-foreground';
                          return (
                            <div key={idx} className="bg-background/60 px-1.5 py-0.5 rounded border border-border/20 flex items-center justify-between gap-1">
                              <span className="truncate max-w-[80px]" title={dv.clubName}>{dv.clubName}</span>
                              <span className={cn('shrink-0 text-right font-medium', choiceColor)}>{choiceLabel}{candidateLabel}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {editable && (
                <Textarea
                  value={topic.summary}
                  onChange={(e) => updateTopicSummary(i, e.target.value)}
                  placeholder="Resumen de la discusión (opcional)"
                  rows={2}
                  className="text-sm"
                />
              )}
              {!editable && topic.summary && (
                <p className="text-sm text-muted-foreground">{topic.summary}</p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Motions */}
      {content.motions && content.motions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Mociones Propuestas</CardTitle>
            <CardDescription>Mociones y resoluciones presentadas durante el transcurso de la reunión.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {content.motions.map((motion) => {
              const motionStatusLabels: Record<string, string> = {
                PROPOSED: 'Propuesta',
                SECONDED: 'Secundada',
                VOTING: 'En Votación',
                APPROVED: 'Aprobada',
                REJECTED: 'Rechazada',
              };
              const motionStatusVariant: Record<string, 'success' | 'destructive' | 'secondary' | 'outline' | 'warning'> = {
                PROPOSED: 'outline',
                SECONDED: 'warning',
                VOTING: 'secondary',
                APPROVED: 'success',
                REJECTED: 'destructive',
              };
              const statusLabel = motionStatusLabels[motion.status] ?? motion.status;
              const statusVariant = motionStatusVariant[motion.status] ?? 'secondary';

              return (
                <div key={motion.id} className="rounded-lg border border-border/60 bg-muted/10 p-3 space-y-1.5 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{motion.title}</span>
                    <Badge variant={statusVariant} className="text-xs">{statusLabel}</Badge>
                  </div>
                  {motion.description && (
                    <p className="text-muted-foreground text-xs bg-background/50 p-2 rounded border border-border/30">
                      {motion.description}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground pt-1 border-t border-border/20">
                    <span>Proponente: <span className="font-medium text-foreground">{motion.proposedByClubName}</span></span>
                    {motion.secondedByClubName && (
                      <span>Secundada por: <span className="font-medium text-foreground">{motion.secondedByClubName}</span></span>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Resolutions */}
      {content.resolutions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resoluciones</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {content.resolutions.map((res) => (
                <li key={res.number} className="flex items-start gap-2">
                  <Badge variant="success" className="text-xs shrink-0">N° {res.number}</Badge>
                  <span>{res.text}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Observations */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Observaciones</CardTitle>
        </CardHeader>
        <CardContent>
          {editable ? (
            <Textarea
              value={content.observations}
              onChange={(e) => updateContent({ observations: e.target.value })}
              placeholder="Observaciones del secretario..."
              rows={4}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              {content.observations || 'Sin observaciones.'}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Closing notes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notas de Cierre</CardTitle>
        </CardHeader>
        <CardContent>
          {editable ? (
            <Textarea
              value={content.closingNotes}
              onChange={(e) => updateContent({ closingNotes: e.target.value })}
              placeholder="Notas de cierre de la reunión..."
              rows={3}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              {content.closingNotes || 'Sin notas.'}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Confirm publish dialog */}
      <Dialog open={confirmPublish} onOpenChange={setConfirmPublish}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publicar acta</DialogTitle>
            <DialogDescription>
              Una vez publicada, el acta no se puede editar. ¿Estás seguro?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmPublish(false)}>Cancelar</Button>
            <Button disabled={publishing} onClick={handlePublish}>
              {publishing ? 'Publicando...' : 'Publicar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
