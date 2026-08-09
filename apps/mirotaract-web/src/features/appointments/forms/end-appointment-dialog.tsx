"use client";

import type { Appointment } from "@/lib/api";
import { useCan, useEndAppointment } from "@/lib/api";
import { Button } from "@equipoit4845/ui";
import { useState } from "react";

import { ConfirmationDialog } from "../components/confirmation-dialog";
import { describeAppointmentTransitionError } from "./appointment-mutation-errors";

/** `ACTIVE -> ENDED` (kernel-spec.md §7.5) — a normal end of term, distinct from `REVOKED`. */
export function EndAppointmentDialog({
  appointment,
}: {
  appointment: Appointment;
}) {
  const [open, setOpen] = useState(false);
  const end = useEndAppointment();
  const canEnd = useCan("kernel.appointment.end", {
    scopeType: "ORGANIZATION",
    scopeId: appointment.organizationId,
  });

  if (!canEnd || appointment.status !== "ACTIVE") return null;

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) end.reset();
      }}
      trigger={<Button variant="secondary">Finalizar</Button>}
      title="Finalizar cargo"
      description="El cargo pasará de ACTIVE a ENDED."
      confirmLabel="Finalizar"
      isPending={end.isPending}
      errorMessage={
        end.isError ? describeAppointmentTransitionError(end.error) : undefined
      }
      onConfirm={() =>
        end.mutate(appointment.id, { onSuccess: () => setOpen(false) })
      }
    />
  );
}
