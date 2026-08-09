"use client";

import { useCan, useCurrentUser, usePerson } from "@/lib/api";
import { DataState, PageHeader } from "@equipoit4845/admin-shell";
import { Skeleton } from "@equipoit4845/ui";

import { describeKernelError } from "@/features/shell/kernel-error-message";

import { personDisplayName } from "../adapters/person-display-name";
import { EditPersonForm } from "../forms/edit-person-form";

export function PersonEditContainer({ personId }: { personId: string }) {
  const personQuery = usePerson(personId);
  const { data: currentUser } = useCurrentUser();
  const canManage = useCan("kernel.person.manage");
  const canUpdateSelf = useCan("kernel.person.update.self");

  if (personQuery.isLoading) {
    return <Skeleton style={{ height: "20rem" }} />;
  }

  if (personQuery.isError) {
    return (
      <DataState kind="error" {...describeKernelError(personQuery.error)} />
    );
  }

  const person = personQuery.data;
  if (!person) return null;

  const isOwnPerson = currentUser?.personId === person.id;
  const canEdit = canManage || (isOwnPerson && canUpdateSelf);

  if (!canEdit) {
    return (
      <DataState
        kind="error"
        title="No tenés permisos para editar esta persona."
      />
    );
  }

  return (
    <>
      <PageHeader
        title={`Editar ${personDisplayName(person)}`}
        breadcrumb={[
          { label: "Personas", href: "/persons" },
          { label: personDisplayName(person), href: `/persons/${person.id}` },
          { label: "Editar" },
        ]}
      />
      <EditPersonForm person={person} />
    </>
  );
}
