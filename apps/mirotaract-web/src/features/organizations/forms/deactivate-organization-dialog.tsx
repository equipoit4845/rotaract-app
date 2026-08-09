"use client";

import type { Organization } from "@/lib/api";
import { useCan, useDeactivateOrganization } from "@/lib/api";
import { Button } from "@equipoit4845/ui";
import { useState } from "react";

import { describeKernelError } from "@/features/shell/kernel-error-message";

import { canDeactivateOrganization } from "../adapters/organization-lifecycle";
import { ConfirmationDialog } from "../components/confirmation-dialog";

/**
 * Visible only with `kernel.organization.activate` — `kernel-spec.md`
 * §10.1 doesn't define a separate deactivate permission;
 * `kernel-openapi.yaml` documents reusing `activate` for both as an
 * explicit assumption (see docs/09-administrative-web.md) — and only
 * when the current status can reach `INACTIVE` (§7.2: `ACTIVE` only).
 */
export function DeactivateOrganizationDialog({
  organization,
}: {
  organization: Organization;
}) {
  const [open, setOpen] = useState(false);
  const deactivate = useDeactivateOrganization();
  const canDeactivate = useCan("kernel.organization.activate", {
    scopeType: "ORGANIZATION",
    scopeId: organization.id,
  });

  if (!canDeactivate || !canDeactivateOrganization(organization.status))
    return null;

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) deactivate.reset();
      }}
      trigger={<Button variant="outline">Desactivar</Button>}
      title="Desactivar organización"
      description={`"${organization.name}" pasará a estar INACTIVA. No aceptará nuevas membresías, períodos ni módulos (invariante 6.3.4) hasta que vuelva a activarse.`}
      confirmLabel="Desactivar"
      isPending={deactivate.isPending}
      errorMessage={
        deactivate.isError ? describeKernelError(deactivate.error) : undefined
      }
      onConfirm={() =>
        deactivate.mutate(organization.id, { onSuccess: () => setOpen(false) })
      }
    />
  );
}
