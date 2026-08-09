"use client";

import type { MembershipTransfer } from "@/lib/api";
import { useCan, useCompleteMembershipTransfer } from "@/lib/api";
import { Button } from "@equipoit4845/ui";
import { useState } from "react";

import { canCompleteTransfer } from "../adapters/transfer-lifecycle";
import { ConfirmationDialog } from "../components/confirmation-dialog";
import { describeTransferTransitionError } from "./transfer-mutation-errors";

/**
 * `CONFIRMED_BY_ORIGIN -> COMPLETED` (kernel-spec.md §7.7). `completeMembershipTransfer`
 * has no dedicated permission in kernel-spec.md §10.1 — `kernel-openapi.yaml`
 * documents the assumption explicitly ("(Supuesto) Se asume
 * `kernel.transfer.confirm`... por ser la misma autoridad de origen quien
 * completa"), so this reuses `kernel.transfer.confirm` scoped to
 * `fromOrganizationId`, same as `ConfirmTransferDialog` — completing is
 * still an origin-side action.
 *
 * This dialog calls ONLY `useCompleteMembershipTransfer()`. The Kernel
 * does everything else in a single transaction (invariant 6.9.5/6.9.6):
 * marks the origin membership `TRANSFERRED`, ends incompatible active
 * appointments, creates/reactivates the destination membership, stores
 * `destinationMembershipId`, emits one event. This never calls
 * `useDeactivateMembership()`, `useCreateMembership()`,
 * `useEndAppointment()` or `useRevokeAppointment()` — that would duplicate
 * business logic the Kernel already owns.
 */
export function CompleteTransferDialog({
  transfer,
}: {
  transfer: MembershipTransfer;
}) {
  const [open, setOpen] = useState(false);
  const complete = useCompleteMembershipTransfer();
  const canComplete = useCan("kernel.transfer.confirm", {
    scopeType: "ORGANIZATION",
    scopeId: transfer.fromOrganizationId,
  });

  if (!canComplete || !canCompleteTransfer(transfer.status)) return null;

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) complete.reset();
      }}
      trigger={<Button>Completar</Button>}
      title="Completar transferencia"
      description="El Kernel moverá la membresía a la organización destino en una única transacción: la membresía origen pasa a TRANSFERRED, se finalizan los cargos activos incompatibles, y se crea o reactiva la membresía destino (invariante 6.9.5). Esta acción es irreversible."
      confirmLabel="Completar"
      isPending={complete.isPending}
      errorMessage={
        complete.isError
          ? describeTransferTransitionError(complete.error)
          : undefined
      }
      onConfirm={() =>
        complete.mutate(transfer.id, { onSuccess: () => setOpen(false) })
      }
    />
  );
}
