"use client";

import type { MembershipTransfer } from "@/lib/api";
import { useCan, useCancelMembershipTransfer, useCurrentUser } from "@/lib/api";
import { Button } from "@equipoit4845/ui";
import { useState } from "react";

import { canCancelTransfer } from "../adapters/transfer-lifecycle";
import { ConfirmationDialog } from "../components/confirmation-dialog";
import { describeTransferTransitionError } from "./transfer-mutation-errors";

/**
 * `cancelMembershipTransfer` has no dedicated permission in
 * kernel-spec.md §10.1 — `kernel-openapi.yaml` documents the assumption
 * explicitly ("Se asume `kernel.transfer.create.self`... por ser el
 * solicitante quien cancela su propia solicitud"). `.self` permissions in
 * this app are never organization-scoped — same pattern as
 * `kernel.person.update.self` in `PersonActionsRow` (Personas, US-PER-04):
 * `useCan("kernel.transfer.create.self")` with no scope, ANDed with an
 * actual identity check (`currentUser.personId === transfer.requestedById`)
 * so the button never appears for a transfer someone else requested, even
 * with the permission granted.
 */
export function CancelTransferDialog({
  transfer,
}: {
  transfer: MembershipTransfer;
}) {
  const [open, setOpen] = useState(false);
  const cancel = useCancelMembershipTransfer();
  const { data: currentUser } = useCurrentUser();
  const canCancelSelf = useCan("kernel.transfer.create.self");
  const isOwnRequest = currentUser?.personId === transfer.requestedById;

  if (!canCancelSelf || !isOwnRequest || !canCancelTransfer(transfer.status)) {
    return null;
  }

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) cancel.reset();
      }}
      trigger={<Button variant="outline">Cancelar transferencia</Button>}
      title="Cancelar tu solicitud de transferencia"
      description="Vas a cancelar tu propia solicitud de transferencia. Esta acción no se puede deshacer."
      confirmLabel="Cancelar transferencia"
      confirmVariant="danger"
      isPending={cancel.isPending}
      errorMessage={
        cancel.isError
          ? describeTransferTransitionError(cancel.error)
          : undefined
      }
      onConfirm={() =>
        cancel.mutate(transfer.id, { onSuccess: () => setOpen(false) })
      }
    />
  );
}
