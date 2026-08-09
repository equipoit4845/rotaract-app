"use client";

import type { Appointment } from "@/lib/api";
import { useCan, useMarkAppointmentElected } from "@/lib/api";
import { Button } from "@equipoit4845/ui";
import { useState } from "react";

import { ConfirmationDialog } from "../components/confirmation-dialog";
import { describeAppointmentTransitionError } from "./appointment-mutation-errors";

/**
 * `NOMINATED -> ELECTED` (kernel-spec.md §7.5). `POST
 * /appointments/{id}/elect` documents `x-required-permission:
 * kernel.appointment.create` — `kernel-openapi.yaml` states this is an
 * assumption because §10.1 doesn't enumerate a dedicated "elect" permission;
 * this gate matches the contract as written, not a guess of our own.
 */
export function MarkElectedDialog({
  appointment,
}: {
  appointment: Appointment;
}) {
  const [open, setOpen] = useState(false);
  const markElected = useMarkAppointmentElected();
  const canElect = useCan("kernel.appointment.create", {
    scopeType: "ORGANIZATION",
    scopeId: appointment.organizationId,
  });

  if (!canElect || appointment.status !== "NOMINATED") return null;

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) markElected.reset();
      }}
      trigger={<Button variant="secondary">Marcar electo</Button>}
      title="Marcar cargo como electo"
      description="El cargo pasará de NOMINATED a ELECTED."
      confirmLabel="Marcar electo"
      isPending={markElected.isPending}
      errorMessage={
        markElected.isError
          ? describeAppointmentTransitionError(markElected.error)
          : undefined
      }
      onConfirm={() =>
        markElected.mutate(appointment.id, { onSuccess: () => setOpen(false) })
      }
    />
  );
}
