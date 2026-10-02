'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAuthState } from '@/context/AuthContext';
import { queueApi } from '@/lib/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type TakeFloorControlProps = {
  meetingId: string;
  currentSpeaker?: { id: string; fullName: string } | null;
  currentTopicId?: string | null;
  className?: string;
};

/**
 * Botón para que el RDR o Secretario tome/suelte la palabra directamente.
 * Al tomarla, reemplaza al orador actual (el backend quita la palabra al anterior)
 * y el LiveTranscriber montado en la página activa el micrófono para transcribir.
 */
export function TakeFloorControl({
  meetingId,
  currentSpeaker,
  currentTopicId,
  className,
}: TakeFloorControlProps) {
  const { user } = useAuthState();
  const [loading, setLoading] = useState(false);

  if (!user || (user.role !== 'RDR' && user.role !== 'SECRETARY')) return null;

  const isSelfSpeaking = currentSpeaker?.id === user.id;
  const interruptedName = !isSelfSpeaking && currentSpeaker ? currentSpeaker.fullName : null;

  async function toggleFloor() {
    if (!user) return;
    setLoading(true);
    try {
      if (isSelfSpeaking) {
        await queueApi.setCurrentSpeaker(meetingId, null);
        toast.success('Soltaste la palabra.');
      } else {
        await queueApi.setCurrentSpeaker(meetingId, user.id);
        if (interruptedName) {
          toast.success(`Tomaste la palabra (se quitó a ${interruptedName}).`);
        } else {
          toast.success('Tomaste la palabra.');
        }
        if (!currentTopicId) {
          toast.info('No hay un tema activo: tu intervención no se transcribirá hasta que se active un tema.');
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cambiar el orador');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant={isSelfSpeaking ? 'destructive' : 'outline'}
      size="sm"
      onClick={toggleFloor}
      disabled={loading}
      className={cn('w-full', className)}
    >
      {loading
        ? 'Actualizando...'
        : isSelfSpeaking
          ? 'Soltar la palabra'
          : '🎙️ Tomar la palabra'}
    </Button>
  );
}
