"use client";

import type { MembershipTransfer } from "@/lib/api";
import { useCan, useRejectMembershipTransfer } from "@/lib/api";
import { Button, FormField, Textarea } from "@equipoit4845/ui";
import { useState } from "react";

import { canRejectTransfer } from "../adapters/transfer-lifecycle";
import { ConfirmationDialog } from "../components/confirmation-dialog";
import { describeTransferTransitionError } from "./transfer-mutation-errors";

/**
 * `{REQUESTED, ACCEPTED_BY_DESTINATION, CONFIRMED_BY_ORIGIN} -> REJECTED`
 * (kernel-spec.md §7.7). `rejectionReason` is `required` on
 * `RejectMembershipTransfer`'s request body (kernel-openapi.yaml,
 * invariant 6.9.7 — "rechazar exige motivo") — unlike
 * `DeactivateMembershipDialog`'s optional `reasonText`, this dialog blocks
 * submit entirely on an empty reason, it never sends `{ rejectionReason: "" }`.
 *
 * `kernel.transfer.reject` has no documented scope restriction in
 * kernel-openapi.yaml (unlike accept/confirm, which the operation
 * descriptions tie explicitly to destination/origin) — an authority at
 * either side of the transfer can stop it, so this checks the permission
 * at BOTH `fromOrganizationId` and `toOrganizationId`, not just one.
 */
export function RejectTransferDialog({
  transfer,
}: {
  transfer: MembershipTransfer;
}) {
  const [open, setOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [touched, setTouched] = useState(false);
  const reject = useRejectMembershipTransfer();
  const canRejectFromOrigin = useCan("kernel.transfer.reject", {
    scopeType: "ORGANIZATION",
    scopeId: transfer.fromOrganizationId,
  });
  const canRejectFromDestination = useCan("kernel.transfer.reject", {
    scopeType: "ORGANIZATION",
    scopeId: transfer.toOrganizationId,
  });

  if (
    !(canRejectFromOrigin || canRejectFromDestination) ||
    !canRejectTransfer(transfer.status)
  ) {
    return null;
  }

  const trimmedReason = rejectionReason.trim();
  const reasonMissing = trimmedReason.length === 0;

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
      trigger={<Button variant="outline">Rechazar</Button>}
      title="Rechazar transferencia"
      description="Esta transferencia se marcará como rechazada. El motivo es obligatorio (invariante 6.9.7)."
      confirmLabel="Rechazar"
      confirmVariant="danger"
      isPending={reject.isPending}
      errorMessage={
        reject.isError
          ? describeTransferTransitionError(reject.error)
          : undefined
      }
      onConfirm={() => {
        setTouched(true);
        if (reasonMissing) return;
        reject.mutate(
          { transferId: transfer.id, rejectionReason: trimmedReason },
          { onSuccess: () => setOpen(false) },
        );
      }}
    >
      <FormField
        label="Motivo"
        htmlFor="rejectionReason"
        required
        error={
          touched && reasonMissing ? "El motivo es obligatorio." : undefined
        }
      >
        <Textarea
          id="rejectionReason"
          rows={3}
          value={rejectionReason}
          onChange={(event) => setRejectionReason(event.target.value)}
        />
      </FormField>
    </ConfirmationDialog>
  );
}
