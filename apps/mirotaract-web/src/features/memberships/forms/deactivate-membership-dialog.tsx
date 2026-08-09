"use client";

import type { OrganizationMembership } from "@/lib/api";
import { useCan, useDeactivateMembership } from "@/lib/api";
import { Button, FormField, Textarea } from "@equipoit4845/ui";
import { useState } from "react";

import { describeMembershipTransitionError } from "./membership-mutation-errors";
import { canDeactivateMembership } from "../adapters/membership-lifecycle";
import { ConfirmationDialog } from "../components/confirmation-dialog";

/**
 * `{PENDING, ACTIVE} -> INACTIVE` (kernel-spec.md §7.3 — deactivate isn't
 * only from `ACTIVE`, `PENDING -> INACTIVE` is also in the machine; see
 * docs/09, US-MEM-07). Permission `kernel.membership.deactivate`.
 * `reasonCode` isn't offered for the same reason as
 * `LeaveMembershipDialog` — no enumerated catalog in the contract.
 * Deactivating gates effective permissions in this organization
 * (invariant 6.4.6) — `invalidateMembership` already covers
 * `authorizationKeys.allEffectivePermissions()`.
 */
export function DeactivateMembershipDialog({
  membership,
  personLabel,
}: {
  membership: OrganizationMembership;
  personLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [reasonText, setReasonText] = useState("");
  const deactivate = useDeactivateMembership();
  const canDeactivate = useCan("kernel.membership.deactivate", {
    scopeType: "ORGANIZATION",
    scopeId: membership.organizationId,
  });

  if (!canDeactivate || !canDeactivateMembership(membership.status))
    return null;

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setReasonText("");
          deactivate.reset();
        }
      }}
      trigger={<Button variant="outline">Desactivar</Button>}
      title="Desactivar membresía"
      description={`La membresía de ${personLabel} pasará a estar INACTIVA y dejará de habilitar cargos activos (invariante 6.4.6) hasta que se reactive.`}
      confirmLabel="Desactivar"
      confirmVariant="danger"
      isPending={deactivate.isPending}
      errorMessage={
        deactivate.isError
          ? describeMembershipTransitionError(deactivate.error)
          : undefined
      }
      onConfirm={() =>
        deactivate.mutate(
          {
            membershipId: membership.id,
            payload: { reasonText: reasonText.trim() || null },
          },
          { onSuccess: () => setOpen(false) },
        )
      }
    >
      <FormField label="Motivo" htmlFor="deactivateReasonText" hint="Opcional.">
        <Textarea
          id="deactivateReasonText"
          rows={2}
          value={reasonText}
          onChange={(event) => setReasonText(event.target.value)}
        />
      </FormField>
    </ConfirmationDialog>
  );
}
