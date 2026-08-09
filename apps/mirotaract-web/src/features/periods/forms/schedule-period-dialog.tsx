"use client";

import type { InstitutionalPeriod } from "@/lib/api";
import { useCan, useSchedulePeriod } from "@/lib/api";
import { Button } from "@equipoit4845/ui";
import { useState } from "react";

import { describeKernelError } from "@/features/shell/kernel-error-message";

import { canSchedulePeriod } from "../adapters/period-lifecycle";
import { ConfirmationDialog } from "../components/confirmation-dialog";

/**
 * Visible only with `kernel.period.update` (`schedulePeriod`'s documented
 * `x-required-permission`, kernel-openapi.yaml — there is no dedicated
 * `kernel.period.schedule` permission code in kernel-spec.md §10.1) and
 * only from `DRAFT` (§7.4: `DRAFT -> SCHEDULED`).
 */
export function SchedulePeriodDialog({
  period,
}: {
  period: InstitutionalPeriod;
}) {
  const [open, setOpen] = useState(false);
  const schedule = useSchedulePeriod();
  const canSchedule = useCan("kernel.period.update", {
    scopeType: "ORGANIZATION",
    scopeId: period.organizationId,
  });

  if (!canSchedule || !canSchedulePeriod(period.status)) return null;

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) schedule.reset();
      }}
      trigger={<Button variant="outline">Programar</Button>}
      title="Programar período"
      description={`"${period.name}" pasará a SCHEDULED, listo para activarse cuando corresponda.`}
      confirmLabel="Programar"
      isPending={schedule.isPending}
      errorMessage={
        schedule.isError ? describeKernelError(schedule.error) : undefined
      }
      onConfirm={() =>
        schedule.mutate(period.id, { onSuccess: () => setOpen(false) })
      }
    />
  );
}
