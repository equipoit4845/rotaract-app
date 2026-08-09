"use client";

import type { OrganizationMembership } from "@/lib/api";
import { useActivateMembership, useCan } from "@/lib/api";
import { Button, FormField, Input } from "@equipoit4845/ui";
import { useState } from "react";

import { describeMembershipTransitionError } from "./membership-mutation-errors";
import { canActivateMembership } from "../adapters/membership-lifecycle";
import { ConfirmationDialog } from "../components/confirmation-dialog";

/**
 * `PENDING -> ACTIVE` (kernel-spec.md §7.3). Visible only with
 * `kernel.membership.activate` and only when the current status can reach
 * `ACTIVE` this way (`PENDING` — see docs/09, US-MEM-04). `joinedAt` is
 * optional in `activateMembership`'s request body (invariant 6.4.2 — the
 * Kernel decides the effective date when omitted).
 */
export function ActivateMembershipDialog({
  membership,
  personLabel,
}: {
  membership: OrganizationMembership;
  personLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [joinedAt, setJoinedAt] = useState("");
  const activate = useActivateMembership();
  const canActivate = useCan("kernel.membership.activate", {
    scopeType: "ORGANIZATION",
    scopeId: membership.organizationId,
  });

  if (!canActivate || !canActivateMembership(membership.status)) return null;

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setJoinedAt("");
          activate.reset();
        }
      }}
      trigger={<Button variant="outline">Activar</Button>}
      title="Activar membresía"
      description={`La membresía de ${personLabel} pasará a estar ACTIVA.`}
      confirmLabel="Activar"
      isPending={activate.isPending}
      errorMessage={
        activate.isError
          ? describeMembershipTransitionError(activate.error)
          : undefined
      }
      onConfirm={() =>
        activate.mutate(
          {
            membershipId: membership.id,
            // `joinedAt` is `date-time` in the contract (kernel-openapi.yaml)
            // — the `<input type="date">` above only collects a calendar
            // date, so it's normalized to midnight UTC on submit.
            joinedAt: joinedAt
              ? new Date(`${joinedAt}T00:00:00.000Z`).toISOString()
              : undefined,
          },
          { onSuccess: () => setOpen(false) },
        )
      }
    >
      <FormField label="Fecha de ingreso" htmlFor="joinedAt" hint="Opcional.">
        <Input
          id="joinedAt"
          type="date"
          value={joinedAt}
          onChange={(event) => setJoinedAt(event.target.value)}
        />
      </FormField>
    </ConfirmationDialog>
  );
}
