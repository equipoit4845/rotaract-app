"use client";

import type { MembershipTransfer } from "@/lib/api";
import { useCan, useConfirmTransferByOrigin } from "@/lib/api";
import { Button } from "@equipoit4845/ui";
import { useState } from "react";

import { canConfirmTransfer } from "../adapters/transfer-lifecycle";
import { ConfirmationDialog } from "../components/confirmation-dialog";
import { TransferOrganizationCell } from "../components/transfer-organization-cell";
import { describeTransferTransitionError } from "./transfer-mutation-errors";

/**
 * `ACCEPTED_BY_DESTINATION -> CONFIRMED_BY_ORIGIN` (kernel-spec.md §7.7).
 * Confirming is an action of the ORIGIN organization — gated with
 * `kernel.transfer.confirm` scoped to `fromOrganizationId`, never just
 * "the permission in general". Having `kernel.transfer.confirm` granted in
 * the destination organization never enables this button — see docs/09,
 * Área 7 preflight.
 */
export function ConfirmTransferDialog({
  transfer,
}: {
  transfer: MembershipTransfer;
}) {
  const [open, setOpen] = useState(false);
  const confirm = useConfirmTransferByOrigin();
  const canConfirm = useCan("kernel.transfer.confirm", {
    scopeType: "ORGANIZATION",
    scopeId: transfer.fromOrganizationId,
  });

  if (!canConfirm || !canConfirmTransfer(transfer.status)) return null;

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) confirm.reset();
      }}
      trigger={<Button variant="outline">Confirmar</Button>}
      title="Confirmar transferencia"
      description={
        <>
          La organización origen (
          <TransferOrganizationCell
            organizationId={transfer.fromOrganizationId}
          />
          ) confirma la salida de esta membresía. Falta completar la
          transferencia para que el Kernel mueva la membresía (invariante
          6.9.5).
        </>
      }
      confirmLabel="Confirmar"
      isPending={confirm.isPending}
      errorMessage={
        confirm.isError
          ? describeTransferTransitionError(confirm.error)
          : undefined
      }
      onConfirm={() =>
        confirm.mutate(transfer.id, { onSuccess: () => setOpen(false) })
      }
    />
  );
}
