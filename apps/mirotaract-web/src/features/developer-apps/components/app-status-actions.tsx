"use client";

import type { DeveloperApp } from "@/lib/api";
import {
  useActivateDeveloperApp,
  useRevokeDeveloperApp,
  useSuspendDeveloperApp,
} from "@/lib/api";
import { ConfirmationDialog } from "@/components/layout";
import { Button } from "@/components/ui";
import { useState } from "react";

import { describeKernelError } from "@/features/shell/kernel-error-message";

type Action = "suspend" | "activate" | "revoke";

/**
 * Pausar / Reactivar / Revocar. Only the transitions the Kernel accepts
 * from the current status are offered (ACTIVE ⇄ SUSPENDED, both → REVOKED);
 * nothing changes on screen until the Kernel confirms.
 */
export function AppStatusActions({ app }: { app: DeveloperApp }) {
  const suspend = useSuspendDeveloperApp();
  const activate = useActivateDeveloperApp();
  const revoke = useRevokeDeveloperApp();
  const [open, setOpen] = useState<Action | null>(null);

  if (app.status === "REVOKED") return null;

  const mutation =
    open === "suspend" ? suspend : open === "activate" ? activate : revoke;

  function start(action: Action) {
    suspend.reset();
    activate.reset();
    revoke.reset();
    setOpen(action);
  }

  const copy: Record<
    Action,
    { title: string; description: string; confirm: string }
  > = {
    suspend: {
      title: "Pausar app",
      description: `${app.name} deja de poder conectarse y nadie puede ingresar con ella hasta que la reactives. No se borra nada.`,
      confirm: "Pausar",
    },
    activate: {
      title: "Reactivar app",
      description: `${app.name} vuelve a poder conectarse con sus credenciales actuales.`,
      confirm: "Reactivar",
    },
    revoke: {
      title: "Revocar app",
      description: `Esto es permanente: ${app.name} pierde el acceso para siempre, sus secretos dejan de funcionar y todas las personas que ingresaron con ella quedan desconectadas. Si la app vuelve a hacer falta, hay que registrarla de nuevo.`,
      confirm: "Revocar app",
    },
  };

  return (
    <>
      {app.status === "ACTIVE" ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => start("suspend")}
        >
          Pausar
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={() => start("activate")}
        >
          Reactivar
        </Button>
      )}
      <Button type="button" variant="danger" onClick={() => start("revoke")}>
        Revocar app
      </Button>

      {open ? (
        <ConfirmationDialog
          open
          onOpenChange={(next) => {
            if (!next) setOpen(null);
          }}
          title={copy[open].title}
          description={copy[open].description}
          confirmLabel={copy[open].confirm}
          confirmVariant={open === "revoke" ? "danger" : "primary"}
          isPending={mutation.isPending}
          errorMessage={
            mutation.isError ? describeKernelError(mutation.error) : undefined
          }
          onConfirm={() =>
            mutation.mutate(app.id, { onSuccess: () => setOpen(null) })
          }
        />
      ) : null}
    </>
  );
}
