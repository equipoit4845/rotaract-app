"use client";

import type { OrganizationMembership } from "@/lib/api";
import { useCan, useResumeMembership } from "@/lib/api";
import { Button } from "@equipoit4845/ui";
import { useState } from "react";

import { describeMembershipTransitionError } from "./membership-mutation-errors";
import { canResumeMembership } from "../adapters/membership-lifecycle";
import { ConfirmationDialog } from "../components/confirmation-dialog";

/**
 * `ON_LEAVE -> ACTIVE` (kernel-spec.md §7.3). Permission
 * `kernel.membership.update` (see docs/09, US-MEM-06). No request body —
 * `resumeMembership` takes none (kernel-openapi.yaml).
 */
export function ResumeMembershipDialog({
  membership,
  personLabel,
}: {
  membership: OrganizationMembership;
  personLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const resume = useResumeMembership();
  const canResume = useCan("kernel.membership.update", {
    scopeType: "ORGANIZATION",
    scopeId: membership.organizationId,
  });

  if (!canResume || !canResumeMembership(membership.status)) return null;

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resume.reset();
      }}
      trigger={<Button variant="outline">Reanudar</Button>}
      title="Reanudar membresía"
      description={`La membresía de ${personLabel} volverá a estar ACTIVA.`}
      confirmLabel="Reanudar"
      isPending={resume.isPending}
      errorMessage={
        resume.isError
          ? describeMembershipTransitionError(resume.error)
          : undefined
      }
      onConfirm={() =>
        resume.mutate(membership.id, { onSuccess: () => setOpen(false) })
      }
    />
  );
}
