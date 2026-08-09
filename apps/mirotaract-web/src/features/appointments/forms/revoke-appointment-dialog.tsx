"use client";

import type { Appointment } from "@/lib/api";
import { useCan, useRevokeAppointment } from "@/lib/api";
import { Button, FormField, Textarea } from "@equipoit4845/ui";
import { useState } from "react";

import { ConfirmationDialog } from "../components/confirmation-dialog";
import { describeAppointmentTransitionError } from "./appointment-mutation-errors";

const REVOCABLE_STATUSES: Appointment["status"][] = [
  "NOMINATED",
  "ELECTED",
  "ACTIVE",
];

/**
 * `NOMINATED|ELECTED -> REVOKED`, `ACTIVE -> REVOKED` (kernel-spec.md §7.5).
 * `revokeReason` is required by `RevokeAppointmentRequest`
 * (`kernel-openapi.yaml`: `required: [revokeReason]`) — a revoked
 * appointment can never be reactivated (invariant 6.6.9), a new one must be
 * created instead.
 */
export function RevokeAppointmentDialog({
  appointment,
}: {
  appointment: Appointment;
}) {
  const [open, setOpen] = useState(false);
  const [revokeReason, setRevokeReason] = useState("");
  const [touched, setTouched] = useState(false);
  const revoke = useRevokeAppointment();
  const canRevoke = useCan("kernel.appointment.revoke", {
    scopeType: "ORGANIZATION",
    scopeId: appointment.organizationId,
  });

  if (!canRevoke || !REVOCABLE_STATUSES.includes(appointment.status))
    return null;

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          revoke.reset();
          setRevokeReason("");
          setTouched(false);
        }
      }}
      trigger={<Button variant="outline">Revocar</Button>}
      title="Revocar cargo"
      description="Un cargo revocado no puede reactivarse; habrá que crear uno nuevo (invariante 6.6.9)."
      confirmLabel="Revocar"
      confirmVariant="danger"
      isPending={revoke.isPending}
      errorMessage={
        revoke.isError
          ? describeAppointmentTransitionError(revoke.error)
          : undefined
      }
      onConfirm={() => {
        setTouched(true);
        if (!revokeReason.trim()) return;
        revoke.mutate(
          { appointmentId: appointment.id, revokeReason: revokeReason.trim() },
          { onSuccess: () => setOpen(false) },
        );
      }}
    >
      <FormField
        label="Motivo de la revocación"
        htmlFor="revokeReason"
        required
        error={
          touched && !revokeReason.trim()
            ? "El motivo es obligatorio."
            : undefined
        }
      >
        <Textarea
          id="revokeReason"
          rows={3}
          value={revokeReason}
          onChange={(event) => setRevokeReason(event.target.value)}
        />
      </FormField>
    </ConfirmationDialog>
  );
}
