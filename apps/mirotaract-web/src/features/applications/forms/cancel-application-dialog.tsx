"use client";

import type { MembershipApplication } from "@/lib/api";
import { useCan, useCancelMembershipApplication } from "@/lib/api";
import { Button } from "@equipoit4845/ui";
import { useState } from "react";

import { canCancelApplication } from "../adapters/application-lifecycle";
import { ConfirmationDialog } from "../components/confirmation-dialog";
import { describeApplicationTransitionError } from "./application-mutation-errors";

/**
 * `{DRAFT, SUBMITTED} -> CANCELLED` (invariant 6.8.6, kernel-spec.md
 * §7.6) — `canCancelApplication` never returns true for
 * `APPROVED`/`REJECTED`/`CANCELLED`/`EXPIRED`, so this dialog is never
 * offered on any of those statuses regardless of permission.
 */
export function CancelApplicationDialog({
  application,
}: {
  application: MembershipApplication;
}) {
  const [open, setOpen] = useState(false);
  const cancel = useCancelMembershipApplication();
  const canCancel = useCan("kernel.application.cancel.self", {
    scopeType: "ORGANIZATION",
    scopeId: application.organizationId,
  });

  if (!canCancel || !canCancelApplication(application.status)) return null;

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) cancel.reset();
      }}
      trigger={<Button variant="outline">Cancelar solicitud</Button>}
      title="Cancelar solicitud de membresía"
      description="La solicitud pasará a estar CANCELADA. Esta acción no se puede deshacer."
      confirmLabel="Cancelar solicitud"
      confirmVariant="danger"
      isPending={cancel.isPending}
      errorMessage={
        cancel.isError
          ? describeApplicationTransitionError(cancel.error)
          : undefined
      }
      onConfirm={() =>
        cancel.mutate(application.id, { onSuccess: () => setOpen(false) })
      }
    />
  );
}
