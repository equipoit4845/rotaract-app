'use client';

import { useState } from 'react';
import { queueApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type RequestToSpeakButtonProps = {
  meetingId: string;
  isRequested: boolean;
  requestId?: string;
  disabled?: boolean;
  className?: string;
};

export function RequestToSpeakButton({
  meetingId,
  isRequested,
  requestId,
  disabled,
  className,
}: RequestToSpeakButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleRequest() {
    setLoading(true);
    try {
      await queueApi.request(meetingId);
      toast.success('Pedido de palabra enviado.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al pedir palabra.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel() {
    if (!requestId) return;
    setLoading(true);
    try {
      await queueApi.cancel(meetingId, requestId);
      toast.success('Pedido de palabra cancelado.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cancelar pedido.');
    } finally {
      setLoading(false);
    }
  }

  if (isRequested) {
    return (
      <Button
        onClick={handleCancel}
        variant="destructive"
        size="lg"
        disabled={disabled || loading}
        className={cn('w-full', className)}
        aria-label="Bajar la mano"
      >
        {loading ? 'Cancelando...' : '✋ Bajar mano'}
      </Button>
    );
  }

  return (
    <Button
      onClick={handleRequest}
      disabled={disabled || loading}
      size="lg"
      className={cn('w-full', className)}
      aria-label="Pedir la palabra"
    >
      {loading ? 'Enviando...' : '✋ Pedir palabra'}
    </Button>
  );
}
