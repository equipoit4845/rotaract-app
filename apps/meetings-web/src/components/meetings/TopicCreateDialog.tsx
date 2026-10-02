'use client';

import { useState } from 'react';
import { topicsApi } from '@/lib/api';
import { TOPIC_TYPE_LABELS } from '@/lib/meeting-constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

type Topic = {
  id: string;
  title: string;
  description?: string | null;
  order: number;
  type: string;
  estimatedDurationSec?: number | null;
  status: string;
};

type TopicCreateDialogProps = {
  meetingId: string;
  onCreated: (topic: Topic) => void;
};

export function TopicCreateDialog({ meetingId, onCreated }: TopicCreateDialogProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState('DISCUSSION');
  const [description, setDescription] = useState('');
  const [durationMin, setDurationMin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function reset() {
    setTitle('');
    setType('DISCUSSION');
    setDescription('');
    setDurationMin('');
    setError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('El título es obligatorio.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const durSec = durationMin ? parseInt(durationMin, 10) * 60 : undefined;
      const t = (await topicsApi.create(meetingId, {
        title: title.trim(),
        type,
        description: description.trim() || undefined,
        estimatedDurationSec: durSec,
      })) as Topic;
      onCreated(t);
      reset();
      setOpen(false);
      toast.success('Tema agregado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear tema.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline">+ Agregar tema</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Agregar tema</DialogTitle>
            <DialogDescription>Agregá un tema a la agenda de la reunión.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {error && (
              <p className="text-sm text-destructive font-medium">{error}</p>
            )}
            <div className="space-y-2">
              <Label htmlFor="topic-title">Título *</Label>
              <Input
                id="topic-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ej: Aprobación del presupuesto"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TOPIC_TYPE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="topic-desc">Descripción</Label>
              <Textarea
                id="topic-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Opcional"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="topic-duration">Duración estimada (minutos)</Label>
              <Input
                id="topic-duration"
                type="number"
                min={1}
                max={120}
                value={durationMin}
                onChange={(e) => setDurationMin(e.target.value)}
                placeholder="Ej: 10"
                className="w-32"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creando...' : 'Agregar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
