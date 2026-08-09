"use client";

import type { OrganizationMembership } from "@/lib/api";
import { useCan, useGraduateMembership } from "@/lib/api";
import { Button } from "@equipoit4845/ui";
import { useState } from "react";

import { describeMembershipTransitionError } from "./membership-mutation-errors";
import { canGraduateMembership } from "../adapters/membership-lifecycle";
import { ConfirmationDialog } from "../components/confirmation-dialog";

/**
 * `ACTIVE -> GRADUATED` (kernel-spec.md §7.3), terminal — there is no
 * documented transition out of `GRADUATED`. Not a pair with "reactivate"
 * (see `ReactivateMembershipDialog`, and docs/09 US-MEM-08). Permission
 * `kernel.membership.update`. No request body.
 */
export function GraduateMembershipDialog({
  membership,
  personLabel,
}: {
  membership: OrganizationMembership;
  personLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const graduate = useGraduateMembership();
  const canGraduate = useCan("kernel.membership.update", {
    scopeType: "ORGANIZATION",
    scopeId: membership.organizationId,
  });

  if (!canGraduate || !canGraduateMembership(membership.status)) return null;

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) graduate.reset();
      }}
      trigger={<Button variant="outline">Graduar</Button>}
      title="Marcar egreso"
      description={`La membresía de ${personLabel} pasará a estar EGRESADA. Este estado es terminal: no hay una transición de vuelta documentada en la máquina de estados.`}
      confirmLabel="Graduar"
      isPending={graduate.isPending}
      errorMessage={
        graduate.isError
          ? describeMembershipTransitionError(graduate.error)
          : undefined
      }
      onConfirm={() =>
        graduate.mutate(membership.id, { onSuccess: () => setOpen(false) })
      }
    />
  );
}
