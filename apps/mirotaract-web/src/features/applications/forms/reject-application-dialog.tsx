"use client";

import type { MembershipApplication } from "@/lib/api";
import { useCan, useRejectMembershipApplication } from "@/lib/api";
import { Button, FormField, Textarea } from "@equipoit4845/ui";
import { useState } from "react";

import { canRejectApplication } from "../adapters/application-lifecycle";
import { ConfirmationDialog } from "../components/confirmation-dialog";
import { describeApplicationTransitionError } from "./application-mutation-errors";

/**
 * `SUBMITTED -> REJECTED` (kernel-spec.md §7.6). `rejectionReason` is
 * `required` in the request schema (invariant 6.8.5, CA-SOL-03,
 * kernel-openapi.yaml) — this form never lets an empty reason reach the
 * mutation: `onConfirm` marks the field touched and returns early while
 * the trimmed value is blank, rendering "El motivo es obligatorio."
 * instead of calling `reject.mutate`, in addition to whatever the Kernel
 * would also reject.
 */
export function RejectApplicationDialog({
  application,
  personLabel,
}: {
  application: MembershipApplication;
  personLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [touched, setTouched] = useState(false);
  const reject = useRejectMembershipApplication();
  const canReject = useCan("kernel.application.review", {
    scopeType: "ORGANIZATION",
    scopeId: application.organizationId,
  });

  if (!canReject || !canRejectApplication(application.status)) return null;

  const trimmedReason = rejectionReason.trim();
  const validationError =
    touched && !trimmedReason ? "El motivo es obligatorio." : undefined;

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setRejectionReason("");
          setTouched(false);
          reject.reset();
        }
      }}
      trigger={<Button variant="danger">Rechazar</Button>}
      title="Rechazar solicitud"
      description={`La solicitud de ${personLabel} pasará a estar RECHAZADA.`}
      confirmLabel="Rechazar"
      confirmVariant="danger"
      isPending={reject.isPending}
      errorMessage={
        reject.isError
          ? describeApplicationTransitionError(reject.error)
          : undefined
      }
      onConfirm={() => {
        setTouched(true);
        if (!trimmedReason) return;
        reject.mutate(
          {
            applicationId: application.id,
            rejectionReason: trimmedReason,
          },
          { onSuccess: () => setOpen(false) },
        );
      }}
    >
      <FormField
        label="Motivo"
        htmlFor="rejectionReason"
        error={validationError}
        required
      >
        <Textarea
          id="rejectionReason"
          rows={2}
          value={rejectionReason}
          onChange={(event) => setRejectionReason(event.target.value)}
        />
      </FormField>
    </ConfirmationDialog>
  );
}
