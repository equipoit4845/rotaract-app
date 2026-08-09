"use client";

import type { Organization } from "@/lib/api";
import { useArchiveOrganization, useCan } from "@/lib/api";
import { Button } from "@equipoit4845/ui";
import { useState } from "react";

import { describeKernelError } from "@/features/shell/kernel-error-message";

import { canArchiveOrganization } from "../adapters/organization-lifecycle";
import { ConfirmationDialog } from "../components/confirmation-dialog";

/**
 * `ARCHIVED` is terminal (§7.2) — the confirmation text is explicit that
 * this isn't deletion (product spec §25): the institutional history is
 * kept, only new operations stop being available. Only offered from
 * `DRAFT`/`INACTIVE`; an `ACTIVE` organization must be deactivated first.
 */
export function ArchiveOrganizationDialog({
  organization,
}: {
  organization: Organization;
}) {
  const [open, setOpen] = useState(false);
  const archive = useArchiveOrganization();
  const canArchive = useCan("kernel.organization.archive", {
    scopeType: "ORGANIZATION",
    scopeId: organization.id,
  });

  if (!canArchive || !canArchiveOrganization(organization.status)) return null;

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) archive.reset();
      }}
      trigger={<Button variant="danger">Archivar</Button>}
      title="Archivar organización"
      description={`Archivar "${organization.name}" es permanente: no vuelve a ACTIVA ni INACTIVA. El historial institucional se conservará y la organización dejará de estar disponible para nuevas operaciones.`}
      confirmLabel="Archivar"
      confirmVariant="danger"
      isPending={archive.isPending}
      errorMessage={
        archive.isError ? describeKernelError(archive.error) : undefined
      }
      onConfirm={() =>
        archive.mutate(organization.id, { onSuccess: () => setOpen(false) })
      }
    />
  );
}
