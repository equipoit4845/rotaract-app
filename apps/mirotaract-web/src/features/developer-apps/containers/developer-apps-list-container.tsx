"use client";

import type { CreatedDeveloperApp } from "@/lib/api";
import { useCan, useDeveloperApps } from "@/lib/api";
import { DataState, PageHeader } from "@/components/layout";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Skeleton,
} from "@/components/ui";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useActiveOrganizationContext } from "@/features/shell/active-organization-context";
import { describeKernelError } from "@/features/shell/kernel-error-message";

import { DeveloperAppsTable } from "../components/developer-apps-table";
import { SecretRevealDialog } from "../components/secret-reveal-dialog";
import { CreateDeveloperAppForm } from "../forms/create-developer-app-form";
import { useAppOrganizations } from "../utils/use-app-organizations";

/**
 * `/developer/apps` — apps registered for the active organization.
 * "Registrar app" is gated on `kernel.app.manage` (UX only; the Kernel
 * enforces it). After creating a server app, its secret is shown once in
 * a dialog; the value only lives in this component's state until closed.
 */
export function DeveloperAppsListContainer() {
  const router = useRouter();
  const { organizationId, organization } = useActiveOrganizationContext();
  const scope = organizationId
    ? { scopeType: "ORGANIZATION" as const, scopeId: organizationId }
    : undefined;
  const canManage = useCan("kernel.app.manage", scope);
  const apps = useDeveloperApps(organizationId);
  const organizations = useAppOrganizations(organization);

  const [createOpen, setCreateOpen] = useState(false);
  const [created, setCreated] = useState<CreatedDeveloperApp | null>(null);

  function handleCreated(result: CreatedDeveloperApp) {
    setCreateOpen(false);
    if (result.clientSecret) {
      setCreated(result);
    } else {
      router.push(`/developer/apps/${result.app.id}`);
    }
  }

  function closeSecret() {
    const appId = created?.app.id;
    setCreated(null);
    if (appId) router.push(`/developer/apps/${appId}`);
  }

  return (
    <>
      <PageHeader
        title="Apps"
        description="Apps de comités y clubes que se conectan con Mi Rotaract: qué datos pueden leer y quién puede ingresar con su cuenta."
        actions={
          canManage ? (
            <Button
              type="button"
              leadingIcon={<Plus className="size-4" aria-hidden />}
              onClick={() => setCreateOpen(true)}
            >
              Registrar app
            </Button>
          ) : undefined
        }
      />

      {apps.isLoading ? (
        <div className="mt-4 flex flex-col gap-2">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : apps.isError ? (
        <DataState kind="error" {...describeKernelError(apps.error)} />
      ) : !apps.data || apps.data.length === 0 ? (
        <DataState
          kind="empty"
          title="Todavía no hay apps registradas"
          description="Cuando un comité o club necesite que su app use los datos de Mi Rotaract, registrala acá para darle sus credenciales."
        />
      ) : (
        <DeveloperAppsTable
          items={apps.data}
          organizationName={organizations.nameOf}
        />
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Registrar app</DialogTitle>
            <DialogDescription>
              Contanos qué es la app y qué necesita. Después vas a poder cambiar
              el nombre, los datos y las direcciones de regreso.
            </DialogDescription>
          </DialogHeader>
          {createOpen ? (
            <CreateDeveloperAppForm
              organizations={organizations.options}
              defaultOrganizationId={organizationId}
              onCreated={handleCreated}
              onCancel={() => setCreateOpen(false)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {created?.clientSecret ? (
        <SecretRevealDialog
          open
          title="App registrada"
          description={`Estas son las credenciales de ${created.app.name}. Pasáselas a quien la desarrolla.`}
          clientId={created.app.clientId}
          secret={created.clientSecret}
          onDone={closeSecret}
        />
      ) : null}
    </>
  );
}
