"use client";

import type { InstitutionalPeriod } from "@/lib/api";
import { useCan, useCancelPeriod } from "@/lib/api";
import { Button } from "@equipoit4845/ui";
import { useState } from "react";

import { describeKernelError } from "@/features/shell/kernel-error-message";

import { canCancelPeriod } from "../adapters/period-lifecycle";
import { ConfirmationDialog } from "../components/confirmation-dialog";

/**
 * Visible only with `kernel.period.update` (`cancelPeriod`'s documented
 * `x-required-permission` — kernel-openapi.yaml explicitly notes this is a
 * (Supuesto) reuse of `kernel.period.update`, since kernel-spec.md §10.1
 * defines no dedicated cancel permission) and only from `DRAFT`/
 * `SCHEDULED` (§7.4). `CANCELLED` is terminal — this is stated plainly,
 * not softened.
 */
export function CancelPeriodDialog({
  period,
}: {
  period: InstitutionalPeriod;
}) {
  const [open, setOpen] = useState(false);
  const cancel = useCancelPeriod();
  const canCancel = useCan("kernel.period.update", {
    scopeType: "ORGANIZATION",
    scopeId: period.organizationId,
  });

  if (!canCancel || !canCancelPeriod(period.status)) return null;

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) cancel.reset();
      }}
      trigger={<Button variant="danger">Cancelar período</Button>}
      title="Cancelar período"
      description={`Cancelar "${period.name}" es permanente: pasará a CANCELLED y no podrá programarse ni activarse.`}
      confirmLabel="Cancelar período"
      confirmVariant="danger"
      isPending={cancel.isPending}
      errorMessage={
        cancel.isError ? describeKernelError(cancel.error) : undefined
      }
      onConfirm={() =>
        cancel.mutate(period.id, { onSuccess: () => setOpen(false) })
      }
    />
  );
}
