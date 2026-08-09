"use client";

import type { Appointment } from "@/lib/api";
import { useActivateAppointment, useCan } from "@/lib/api";
import { Button } from "@equipoit4845/ui";
import { useState } from "react";

import { ConfirmationDialog } from "../components/confirmation-dialog";
import { describeAppointmentTransitionError } from "./appointment-mutation-errors";

/** `ELECTED -> ACTIVE` (kernel-spec.md §7.5). May 409 on a singleton conflict (CA-APP-02) even when the transition itself is otherwise valid. */
export function ActivateAppointmentDialog({
  appointment,
}: {
  appointment: Appointment;
}) {
  const [open, setOpen] = useState(false);
  const activate = useActivateAppointment();
  const canActivate = useCan("kernel.appointment.activate", {
    scopeType: "ORGANIZATION",
    scopeId: appointment.organizationId,
  });

  if (!canActivate || appointment.status !== "ELECTED") return null;

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) activate.reset();
      }}
      trigger={<Button variant="secondary">Activar</Button>}
      title="Activar cargo"
      description="El cargo pasará de ELECTED a ACTIVE. Puede materializar una asignación de rol técnico derivada."
      confirmLabel="Activar"
      isPending={activate.isPending}
      errorMessage={
        activate.isError
          ? describeAppointmentTransitionError(activate.error)
          : undefined
      }
      onConfirm={() =>
        activate.mutate(appointment.id, { onSuccess: () => setOpen(false) })
      }
    />
  );
}
