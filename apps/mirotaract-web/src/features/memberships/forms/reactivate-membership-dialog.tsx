"use client";

import type { OrganizationMembership } from "@/lib/api";
import { useCan, useReactivateMembership } from "@/lib/api";
import { Button } from "@equipoit4845/ui";
import { useState } from "react";

import { describeMembershipTransitionError } from "./membership-mutation-errors";
import { canReactivateMembership } from "../adapters/membership-lifecycle";
import { ConfirmationDialog } from "../components/confirmation-dialog";

/**
 * `INACTIVE -> ACTIVE` only (kernel-spec.md §7.3 + kernel-openapi.yaml's
 * explicit note on `reactivateMembership`) — never offered for
 * `GRADUATED`/`TRANSFERRED`, which have no documented return path (see
 * docs/09, US-MEM-08). Permission `kernel.membership.update`. Invariant
 * 6.4.7: preserves the same membership id and appends to history — this
 * never creates a new membership.
 */
export function ReactivateMembershipDialog({
  membership,
  personLabel,
}: {
  membership: OrganizationMembership;
  personLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const reactivate = useReactivateMembership();
  const canReactivate = useCan("kernel.membership.update", {
    scopeType: "ORGANIZATION",
    scopeId: membership.organizationId,
  });

  if (!canReactivate || !canReactivateMembership(membership.status))
    return null;

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reactivate.reset();
      }}
      trigger={<Button variant="outline">Reactivar</Button>}
      title="Reactivar membresía"
      description={`La membresía de ${personLabel} volverá a estar ACTIVA, conservando el mismo ID y su historial (invariante 6.4.7).`}
      confirmLabel="Reactivar"
      isPending={reactivate.isPending}
      errorMessage={
        reactivate.isError
          ? describeMembershipTransitionError(reactivate.error)
          : undefined
      }
      onConfirm={() =>
        reactivate.mutate(membership.id, { onSuccess: () => setOpen(false) })
      }
    />
  );
}
