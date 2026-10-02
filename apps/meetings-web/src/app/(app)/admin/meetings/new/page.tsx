'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { meetingsApi } from '@/lib/api';
import { useClubsListQuery } from '@/lib/queries';
import { SectionHeader } from '@/components/layout/SectionHeader';
import { FormSection } from '@/components/ui/form-section';
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
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function NewMeetingPage() {
  const router = useRouter();
  const { data: clubsData, isLoading: clubsLoading } = useClubsListQuery(false, true);
  const clubs = (clubsData ?? []) as { id: string; name: string; code: string }[];
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [clubId, setClubId] = useState('');
  const [meetingType, setMeetingType] = useState('ORDINARY');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('El título es obligatorio.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const m = (await meetingsApi.create({
        title: title.trim(),
        description: description.trim() || undefined,
        scheduledAt: scheduledAt || undefined,
        clubId: clubId || clubs[0]?.id,
        type: meetingType,
      })) as { id: string };
      router.push(`/admin/meetings/${m.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Nueva reunión"
        description="Creá una reunión distrital y configurá la agenda."
      />

      <Card className="max-w-lg">
        <CardContent className="pt-6">
          {clubsLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <p className="text-sm text-destructive font-medium">{error}</p>
              )}

              <FormSection title="Información general" description="Datos básicos de la reunión.">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Título *</Label>
                    <Input
                      id="title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      required
                      placeholder="Ej: Asamblea de marzo"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Descripción</Label>
                    <Textarea
                      id="description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                      placeholder="Opcional"
                    />
                  </div>
                </div>
              </FormSection>

              <FormSection title="Programación" description="Tipo, fecha y club de la reunión.">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Tipo de reunión</Label>
                    <Select value={meetingType} onValueChange={setMeetingType}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ORDINARY">Ordinaria (Art. 37)</SelectItem>
                        <SelectItem value="EXTRAORDINARY">Extraordinaria (Art. 39)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {meetingType === 'ORDINARY'
                        ? 'Preaviso de 15 días. Mínimo 4 por período.'
                        : 'Preaviso de 30 días (presencial) o 15 días (virtual).'}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="scheduledAt">Fecha programada</Label>
                    <Input
                      id="scheduledAt"
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Club *</Label>
                    <Select
                      value={clubId || clubs[0]?.id}
                      onValueChange={setClubId}
                      required
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Seleccionar club" />
                      </SelectTrigger>
                      <SelectContent>
                        {clubs.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </FormSection>

              <div className="flex gap-2 pt-2">
                <Button type="submit" disabled={loading}>
                  {loading ? 'Creando...' : 'Crear reunión'}
                </Button>
                <Button type="button" variant="outline" asChild>
                  <Link href="/admin/meetings">Cancelar</Link>
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
