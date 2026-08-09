"use client";

import type { Organization } from "@/lib/api";
import { useActivateOrganization, useCan } from "@/lib/api";
import { Button } from "@equipoit4845/ui";
import { useState } from "react";

import { describeKernelError } from "@/features/shell/kernel-error-message";

import { canActivateOrganization } from "../adapters/organization-lifecycle";
import { ConfirmationDialog } from "../components/confirmation-dialog";

/**
 * Visible only with `kernel.organization.activate` (same permission as
 * deactivate — see docs/09 note) and only when the current status can
 * actually reach `ACTIVE` (§7.2: `DRAFT`/`INACTIVE` → `ACTIVE`).
 */
export function ActivateOrganizationDialog({
  organization,
}: {
  organization: Organization;
}) {
  const [open, setOpen] = useState(false);
  const activate = useActivateOrganization();
  const canActivate = useCan("kernel.organization.activate", {
    scopeType: "ORGANIZATION",
    scopeId: organization.id,
  });

  if (!canActivate || !canActivateOrganization(organization.status))
    return null;

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) activate.reset();
      }}
      trigger={<Button variant="outline">Activar</Button>}
      title="Activar organización"
      description={`"${organization.name}" pasará a estar ACTIVA y podrá recibir nuevas membresías, períodos y módulos.`}
      confirmLabel="Activar"
      isPending={activate.isPending}
      errorMessage={
        activate.isError ? describeKernelError(activate.error) : undefined
      }
      onConfirm={() =>
        activate.mutate(organization.id, { onSuccess: () => setOpen(false) })
      }
    />
  );
}
