"use client";

import type { MembershipApplication } from "@/lib/api";
import { useApproveMembershipApplication, useCan } from "@/lib/api";
import { Button } from "@equipoit4845/ui";
import { useState } from "react";

import { canApproveApplication } from "../adapters/application-lifecycle";
import { ConfirmationDialog } from "../components/confirmation-dialog";
import { describeApplicationTransitionError } from "./application-mutation-errors";

/**
 * `SUBMITTED -> APPROVED` (kernel-spec.md §7.6). This calls ONLY
 * `useApproveMembershipApplication()` — the Kernel creates or reactivates
 * the applicant's membership inside the same transaction (invariant
 * 6.8.3-4, CA-SOL-02, kernel-openapi.yaml: "Crea o reactiva la membresía
 * en la misma transacción"). This component never calls
 * `useCreateMembership`/`useReactivateMembership` itself — that would
 * duplicate business logic the Kernel already owns. The hook's own cache
 * invalidation (`membershipsAffected: true`, already implemented in
 * `applications.hooks.ts`) is what refreshes membership/permission data
 * elsewhere in the app once the Kernel confirms.
 */
export function ApproveApplicationDialog({
  application,
  personLabel,
}: {
  application: MembershipApplication;
  personLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const approve = useApproveMembershipApplication();
  const canApprove = useCan("kernel.application.review", {
    scopeType: "ORGANIZATION",
    scopeId: application.organizationId,
  });

  if (!canApprove || !canApproveApplication(application.status)) return null;

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) approve.reset();
      }}
      trigger={<Button>Aprobar</Button>}
      title="Aprobar solicitud"
      description={`Se creará o reactivará la membresía de ${personLabel} en esta organización.`}
      confirmLabel="Aprobar"
      isPending={approve.isPending}
      errorMessage={
        approve.isError
          ? describeApplicationTransitionError(approve.error)
          : undefined
      }
      onConfirm={() =>
        approve.mutate(application.id, { onSuccess: () => setOpen(false) })
      }
    />
  );
}
