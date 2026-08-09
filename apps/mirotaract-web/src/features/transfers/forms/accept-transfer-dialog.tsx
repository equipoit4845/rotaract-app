"use client";

import type { MembershipTransfer } from "@/lib/api";
import { useAcceptTransferByDestination, useCan } from "@/lib/api";
import { Button } from "@equipoit4845/ui";
import { useState } from "react";

import { canAcceptTransfer } from "../adapters/transfer-lifecycle";
import { ConfirmationDialog } from "../components/confirmation-dialog";
import { TransferOrganizationCell } from "../components/transfer-organization-cell";
import { describeTransferTransitionError } from "./transfer-mutation-errors";

/**
 * `REQUESTED -> ACCEPTED_BY_DESTINATION` (kernel-spec.md §7.7). Accepting
 * is an action of the DESTINATION organization — gated with
 * `kernel.transfer.accept` scoped to `toOrganizationId`, never just "the
 * permission in general". Having `kernel.transfer.accept` granted in some
 * other organization (including the origin) never enables this button —
 * see docs/09, Área 7 preflight.
 */
export function AcceptTransferDialog({
  transfer,
}: {
  transfer: MembershipTransfer;
}) {
  const [open, setOpen] = useState(false);
  const accept = useAcceptTransferByDestination();
  const canAccept = useCan("kernel.transfer.accept", {
    scopeType: "ORGANIZATION",
    scopeId: transfer.toOrganizationId,
  });

  if (!canAccept || !canAcceptTransfer(transfer.status)) return null;

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) accept.reset();
      }}
      trigger={<Button variant="outline">Aceptar</Button>}
      title="Aceptar transferencia"
      description={
        <>
          La organización destino (
          <TransferOrganizationCell
            organizationId={transfer.toOrganizationId}
          />
          ) acepta recibir esta membresía. El origen todavía debe confirmar
          antes de que se complete (invariante 6.9.4).
        </>
      }
      confirmLabel="Aceptar"
      isPending={accept.isPending}
      errorMessage={
        accept.isError
          ? describeTransferTransitionError(accept.error)
          : undefined
      }
      onConfirm={() =>
        accept.mutate(transfer.id, { onSuccess: () => setOpen(false) })
      }
    />
  );
}
