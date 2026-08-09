"use client";

import type { InstitutionalPeriod } from "@/lib/api";
import { useActivatePeriod, useCan } from "@/lib/api";
import { Button } from "@equipoit4845/ui";
import { useState } from "react";

import { canActivatePeriod } from "../adapters/period-lifecycle";
import { ConfirmationDialog } from "../components/confirmation-dialog";
import { describeActivatePeriodError } from "./period-mutation-errors";

/**
 * Visible only with `kernel.period.activate` and only from `SCHEDULED`
 * (§7.4: `SCHEDULED -> ACTIVE`). A 409 here always shows the institutional
 * "can't have two ACTIVE periods / must be SCHEDULED" message
 * (`describeActivatePeriodError`) — the two-ACTIVE-periods conflict
 * (invariant 6.5.3) is never detected or prevented client-side before
 * submitting, only surfaced from the Kernel's real response.
 */
export function ActivatePeriodDialog({
  period,
}: {
  period: InstitutionalPeriod;
}) {
  const [open, setOpen] = useState(false);
  const activate = useActivatePeriod();
  const canActivate = useCan("kernel.period.activate", {
    scopeType: "ORGANIZATION",
    scopeId: period.organizationId,
  });

  if (!canActivate || !canActivatePeriod(period.status)) return null;

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) activate.reset();
      }}
      trigger={<Button variant="outline">Activar</Button>}
      title="Activar período"
      description={`"${period.name}" pasará a ACTIVE. No puede haber otro período ACTIVE para esta organización al mismo tiempo.`}
      confirmLabel="Activar"
      isPending={activate.isPending}
      errorMessage={
        activate.isError
          ? describeActivatePeriodError(activate.error)
          : undefined
      }
      onConfirm={() =>
        activate.mutate(period.id, { onSuccess: () => setOpen(false) })
      }
    />
  );
}
