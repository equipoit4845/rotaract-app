'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

type Club = { clubId: string; clubName: string; connected: boolean };

type VoteReadyModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clubAttendance: Club[];
  topicTitle: string;
  onContinue: () => void;
  onAllPresent: () => void;
};

export function VoteReadyModal({
  open,
  onOpenChange,
  clubAttendance,
  topicTitle,
  onContinue,
  onAllPresent,
}: VoteReadyModalProps) {
  const connected = clubAttendance.filter((c) => c.connected);
  const disconnected = clubAttendance.filter((c) => !c.connected);

  // Auto-open vote when all clubs connect
  useEffect(() => {
    if (open && disconnected.length === 0 && clubAttendance.length > 0) {
      onAllPresent();
    }
  }, [open, disconnected.length, clubAttendance.length, onAllPresent]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Clubes no presentes</DialogTitle>
          <DialogDescription>
            Hay {disconnected.length} club{disconnected.length === 1 ? '' : 'es'} sin
            conexión activa. Podés continuar sin ellos o esperar a que se conecten.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Votación: <span className="font-medium text-foreground">{topicTitle}</span>
          </p>

          <div className="flex items-center gap-2 text-sm">
            <Badge variant="success">{connected.length}</Badge>
            <span>presentes</span>
            <span className="text-muted-foreground">de</span>
            <Badge variant="secondary">{clubAttendance.length}</Badge>
            <span>registrados</span>
          </div>

          {/* Disconnected clubs */}
          {disconnected.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Sin conexión
              </p>
              <div className="flex flex-wrap gap-1.5">
                {disconnected.map((c) => (
                  <span
                    key={c.clubId}
                    className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-xs text-destructive"
                  >
                    <span className="size-1.5 rounded-full bg-destructive" />
                    {c.clubName}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Connected clubs */}
          {connected.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Conectados
              </p>
              <div className="flex flex-wrap gap-1.5">
                {connected.map((c) => (
                  <span
                    key={c.clubId}
                    className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-xs text-success"
                  >
                    <span className="size-1.5 rounded-full bg-success animate-pulse" />
                    {c.clubName}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Esperar
          </Button>
          <Button onClick={onContinue}>
            Continuar con {connected.length} papeleta{connected.length === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
