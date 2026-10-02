"use client";

import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui";
import type { ReactNode } from "react";

import { CopyableValue } from "./copy-button";

/**
 * Shows a client secret the only time the Kernel returns it. The value
 * lives in the caller's state only while this dialog is open — it is never
 * cached, stored or logged — and clicking outside does not dismiss it, so
 * nobody loses it by accident.
 */
export function SecretRevealDialog({
  open,
  title,
  description,
  clientId,
  secret,
  note,
  onDone,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  clientId: string;
  secret: string;
  note?: ReactNode;
  onDone: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onDone();
      }}
    >
      <DialogContent
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <Alert
          tone="warning"
          title="No lo vas a poder ver de nuevo"
          description="Copiá el secreto y guardalo en un lugar seguro (por ejemplo, las variables de entorno del servidor). Si lo perdés, vas a tener que crear uno nuevo."
        />

        <div className="space-y-3">
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              Identificador de la app (client_id)
            </p>
            <CopyableValue value={clientId} copyLabel="Copiar identificador" />
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              Secreto (client_secret)
            </p>
            <CopyableValue value={secret} copyLabel="Copiar secreto" />
          </div>
        </div>

        {note ? (
          <div className="text-sm text-muted-foreground">{note}</div>
        ) : null}

        <DialogFooter>
          <Button type="button" onClick={onDone}>
            Listo, ya lo guardé
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
