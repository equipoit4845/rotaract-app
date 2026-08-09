"use client";

import type { OrganizationMembership } from "@/lib/api";
import { useCan, usePutMembershipOnLeave } from "@/lib/api";
import { Button, FormField, Textarea } from "@equipoit4845/ui";
import { useState } from "react";

import { describeMembershipTransitionError } from "./membership-mutation-errors";
import { canPutMembershipOnLeave } from "../adapters/membership-lifecycle";
import { ConfirmationDialog } from "../components/confirmation-dialog";

/**
 * `ACTIVE -> ON_LEAVE` (kernel-spec.md §7.3). Permission
 * `kernel.membership.update` — there is no dedicated `leave` permission in
 * `kernel-spec.md` §10.1; `kernel-openapi.yaml` assigns `update` to this
 * operation explicitly (see docs/09, US-MEM-05). `reasonCode` isn't
 * offered: the contract types it as a free string with no enumerated
 * catalog, so this doesn't invent one — only `reasonText` is collected.
 */
export function LeaveMembershipDialog({
  membership,
  personLabel,
}: {
  membership: OrganizationMembership;
  personLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [reasonText, setReasonText] = useState("");
  const putOnLeave = usePutMembershipOnLeave();
  const canLeave = useCan("kernel.membership.update", {
    scopeType: "ORGANIZATION",
    scopeId: membership.organizationId,
  });

  if (!canLeave || !canPutMembershipOnLeave(membership.status)) return null;

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setReasonText("");
          putOnLeave.reset();
        }
      }}
      trigger={<Button variant="outline">Poner en licencia</Button>}
      title="Poner en licencia a esta membresía"
      description={`La membresía de ${personLabel} pasará a estar EN LICENCIA.`}
      confirmLabel="Poner en licencia"
      isPending={putOnLeave.isPending}
      errorMessage={
        putOnLeave.isError
          ? describeMembershipTransitionError(putOnLeave.error)
          : undefined
      }
      onConfirm={() =>
        putOnLeave.mutate(
          {
            membershipId: membership.id,
            payload: { reasonText: reasonText.trim() || null },
          },
          { onSuccess: () => setOpen(false) },
        )
      }
    >
      <FormField label="Motivo" htmlFor="reasonText" hint="Opcional.">
        <Textarea
          id="reasonText"
          rows={2}
          value={reasonText}
          onChange={(event) => setReasonText(event.target.value)}
        />
      </FormField>
    </ConfirmationDialog>
  );
}
