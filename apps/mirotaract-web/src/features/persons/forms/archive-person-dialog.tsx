"use client";

import type { Person } from "@/lib/api";
import { useArchivePerson, useCan } from "@/lib/api";
import { Button } from "@equipoit4845/ui";
import { useState } from "react";

import { describeKernelError } from "@/features/shell/kernel-error-message";

import { canArchivePerson } from "../adapters/person-lifecycle";
import { personDisplayName } from "../adapters/person-display-name";
import { ConfirmationDialog } from "../components/confirmation-dialog";

/**
 * Archive ≠ delete (product spec §18): the copy is explicit that history
 * is kept and only new memberships/cargos/roles stop being possible
 * (invariante 6.2.3), never implying the record disappears.
 */
export function ArchivePersonDialog({ person }: { person: Person }) {
  const [open, setOpen] = useState(false);
  const archive = useArchivePerson();
  const canManage = useCan("kernel.person.manage");

  if (!canManage || !canArchivePerson(person)) return null;

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) archive.reset();
      }}
      trigger={<Button variant="danger">Archivar</Button>}
      title="Archivar persona"
      description={`Archivar a "${personDisplayName(person)}" no borra su historial: sólo deja de poder recibir membresías, cargos o roles nuevos (invariante 6.2.3).`}
      confirmLabel="Archivar"
      confirmVariant="danger"
      isPending={archive.isPending}
      errorMessage={
        archive.isError ? describeKernelError(archive.error) : undefined
      }
      onConfirm={() =>
        archive.mutate(person.id, { onSuccess: () => setOpen(false) })
      }
    />
  );
}
