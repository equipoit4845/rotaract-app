"use client";

import type { InstitutionalPeriod } from "@/lib/api";
import { useCan, useClosePeriod } from "@/lib/api";
import { Button } from "@equipoit4845/ui";
import { useState } from "react";

import { describeKernelError } from "@/features/shell/kernel-error-message";

import { canClosePeriod } from "../adapters/period-lifecycle";
import { ConfirmationDialog } from "../components/confirmation-dialog";

/**
 * The single most sensitive action in this feature (product spec §31).
 * The description below states ONLY the consequence the Kernel/spec
 * actually guarantee in the same transaction (kernel-spec.md invariant
 * 6.5.8 / CA-PER-04, kernel-openapi.yaml `closePeriod`): closing finalizes
 * this organization's active cargos. It never implies anything about
 * Membership, Applications or Transfers — those aren't part of what
 * `ClosePeriod` does per the spec.
 *
 * This dialog calls only the real `closePeriod` operation
 * (`useClosePeriod`, `@/lib/api`) — it never calls an Appointment mutation
 * directly; the cascading end-of-appointment happens server-side, in the
 * same Kernel transaction. `useClosePeriod`'s own `onSuccess` (see
 * `src/lib/api/periods/periods.hooks.ts`) invalidates the period's own
 * detail/list/current-period caches plus
 * `appointmentKeys.currentAuthorities(organizationId)` and
 * `authorizationKeys.allEffectivePermissions()` — both already public
 * query-key exports from `@/lib/api`, never imported from
 * `src/features/appointments/**`. This component only triggers that
 * mutation and lets those invalidations do their job; it never reaches
 * into `src/features/appointments/**` itself.
 */
export function ClosePeriodDialog({ period }: { period: InstitutionalPeriod }) {
  const [open, setOpen] = useState(false);
  const close = useClosePeriod();
  const canClose = useCan("kernel.period.close", {
    scopeType: "ORGANIZATION",
    scopeId: period.organizationId,
  });

  if (!canClose || !canClosePeriod(period.status)) return null;

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) close.reset();
      }}
      trigger={<Button variant="danger">Cerrar período</Button>}
      title="Cerrar período"
      description={`Cerrar "${period.name}" es permanente: pasará a CLOSED y finalizará todos los cargos activos de esta organización en la misma transacción.`}
      confirmLabel="Cerrar período"
      confirmVariant="danger"
      isPending={close.isPending}
      errorMessage={
        close.isError ? describeKernelError(close.error) : undefined
      }
      onConfirm={() =>
        close.mutate(period.id, { onSuccess: () => setOpen(false) })
      }
    />
  );
}
