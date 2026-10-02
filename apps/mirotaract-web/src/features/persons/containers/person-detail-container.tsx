"use client";

import { KernelApiError, usePerson } from "@/lib/api";
import { Avatar, DataState, EntityHero } from "@/components/layout";
import {
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui";

import { describeKernelError } from "@/features/shell/kernel-error-message";

import { personDisplayName } from "../adapters/person-display-name";
import { PersonAccountTab } from "../components/person-account-tab";
import { PersonActionsRow } from "../components/person-actions-row";
import { PersonHistoryTab } from "../components/person-history-tab";
import { PersonIdentityTab } from "../components/person-identity-tab";
import { PersonMembershipList } from "../components/person-membership-list";

export function PersonDetailContainer({ personId }: { personId: string }) {
  const personQuery = usePerson(personId);

  if (personQuery.isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (personQuery.isError) {
    const error = personQuery.error;
    if (error instanceof KernelApiError && error.isNotFound) {
      return (
        <DataState
          kind="empty"
          title="Persona no encontrada"
          description="No encontramos la persona que buscás. Puede haber sido archivada hace mucho o el enlace estar desactualizado."
        />
      );
    }
    return <DataState kind="error" {...describeKernelError(error)} />;
  }

  const person = personQuery.data;
  if (!person) return null;

  return (
    <>
      <EntityHero
        image={<Avatar name={personDisplayName(person)} size="lg" />}
        title={personDisplayName(person)}
        subtitle={person.archivedAt ? "Persona archivada" : undefined}
        breadcrumb={[
          { label: "Usuarios y socios", href: "/persons" },
          { label: personDisplayName(person) },
        ]}
        actions={<PersonActionsRow person={person} />}
      />
      <Tabs defaultValue="identity">
        <TabsList>
          <TabsTrigger value="identity">Identidad</TabsTrigger>
          <TabsTrigger value="memberships">Clubes</TabsTrigger>
          <TabsTrigger value="account">Cuenta</TabsTrigger>
          <TabsTrigger value="history">Historial</TabsTrigger>
        </TabsList>
        <TabsContent value="identity">
          <PersonIdentityTab person={person} />
        </TabsContent>
        <TabsContent value="memberships">
          <PersonMembershipList personId={person.id} />
        </TabsContent>
        <TabsContent value="account">
          <PersonAccountTab />
        </TabsContent>
        <TabsContent value="history">
          <PersonHistoryTab person={person} />
        </TabsContent>
      </Tabs>
    </>
  );
}
