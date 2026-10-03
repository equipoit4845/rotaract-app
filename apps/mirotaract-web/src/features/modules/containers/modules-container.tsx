"use client";

import type { JsonSchemaNode, ModuleDefinition } from "@/lib/api";
import {
  KernelApiError,
  useActivateModuleInstallation,
  useCan,
  useDeveloperApps,
  useDisableModuleInstallation,
  useInstallModule,
  useModules,
  useOrganizationModules,
  useSuspendModuleInstallation,
  useUpdateModuleConfiguration,
} from "@/lib/api";
import { ConfirmationDialog, DataState, PageHeader } from "@/components/layout";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui";
import { Upload } from "lucide-react";
import { useState } from "react";

import { useActiveOrganizationContext } from "@/features/shell/active-organization-context";
import { describeKernelError } from "@/features/shell/kernel-error-message";

import { DistrictModulesOverview } from "../components/district-modules-overview";
import { ModuleCard, type ModuleAction } from "../components/module-card";
import { ModuleConfigurationForm } from "../forms/module-configuration-form";
import { PublishModuleDialog } from "../forms/publish-module-dialog";
import { errorsByPath } from "../utils/schema-form";

type Pending = { action: ModuleAction; module: ModuleDefinition } | null;

/**
 * `/modules` — committee solutions the club (or the district) can add to
 * Mi Rotaract: catalog, install / activate / deactivate / uninstall and a
 * configuration form generated from each module's JSON Schema. In the
 * district workspace it also shows which clubs use each module, and the
 * RDR publishes modules from their manifest. Buttons are gated with
 * `useCan` (UX only); the Kernel enforces every action.
 */
export function ModulesContainer() {
  const { organizationId, organization } = useActiveOrganizationContext();
  const isDistrict = organization?.type === "DISTRICT";
  const scope = organizationId
    ? { scopeType: "ORGANIZATION" as const, scopeId: organizationId }
    : undefined;
  const can = {
    install: useCan("kernel.module.install", scope),
    configure: useCan("kernel.module.configure", scope),
    disable: useCan("kernel.module.disable", scope),
    publish: useCan("kernel.module.register", scope),
  };
  const catalog = useModules(organizationId);
  const installations = useOrganizationModules(organizationId);
  const apps = useDeveloperApps(
    can.publish && isDistrict ? organizationId : undefined,
  );

  const [pending, setPending] = useState<Pending>(null);
  const [publishing, setPublishing] = useState<{
    module?: ModuleDefinition;
  } | null>(null);

  const install = useInstallModule();
  const activate = useActivateModuleInstallation();
  const configure = useUpdateModuleConfiguration();
  const suspend = useSuspendModuleInstallation();
  const uninstall = useDisableModuleInstallation();

  const placeName = organization?.name ?? "esta organización";
  const installationOf = (moduleId: string) =>
    installations.data?.find((item) => item.moduleId === moduleId);
  // Retired modules disappear from the catalog unless they're still in use here.
  const visible = (catalog.data ?? []).filter(
    (module) =>
      module.status === "ACTIVE" ||
      (module.status === "DEPRECATED" &&
        installationOf(module.id) &&
        installationOf(module.id)?.status !== "DISABLED"),
  );

  function open(action: ModuleAction, module: ModuleDefinition) {
    install.reset();
    activate.reset();
    configure.reset();
    suspend.reset();
    uninstall.reset();
    if (action === "publish") setPublishing({ module });
    else setPending({ action, module });
  }
  const close = () => setPending(null);
  const target = (module: ModuleDefinition) => ({
    organizationId: organizationId as string,
    moduleId: module.id,
  });

  async function installAndActivate(
    module: ModuleDefinition,
    configuration?: Record<string, unknown>,
  ) {
    try {
      await install.mutateAsync({ ...target(module), configuration });
      await activate.mutateAsync(target(module));
      close();
    } catch {
      // Shown in the dialog (install.error / activate.error).
    }
  }

  const header = (
    <PageHeader
      title="Módulos"
      description={
        isDistrict
          ? "Soluciones de los comités que se suman a Mi Rotaract. Instalalas para el distrito y mirá qué clubes las usan."
          : `Soluciones de los comités que ${placeName} puede sumar a Mi Rotaract. Instalá las que necesiten y configuralas para el club.`
      }
      actions={
        can.publish && isDistrict ? (
          <Button
            type="button"
            leadingIcon={<Upload className="size-4" aria-hidden />}
            onClick={() => setPublishing({})}
          >
            Publicar módulo
          </Button>
        ) : undefined
      }
    />
  );

  let body;
  if (catalog.isLoading || installations.isLoading) {
    body = (
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    );
  } else if (catalog.isError || installations.isError) {
    body = (
      <DataState
        kind="error"
        {...describeKernelError(catalog.error ?? installations.error)}
      />
    );
  } else if (visible.length === 0) {
    body = (
      <DataState
        kind="empty"
        title="Todavía no hay módulos disponibles"
        description={
          can.publish
            ? "Cuando un comité tenga su app lista, publicá su manifiesto con “Publicar módulo”."
            : "Cuando el distrito publique módulos de los comités, los vas a ver acá."
        }
      />
    );
  } else {
    body = (
      <div className="grid gap-4 md:grid-cols-2">
        {visible.map((module) => (
          <ModuleCard
            key={module.id}
            module={module}
            installation={installationOf(module.id)}
            can={{ ...can, publish: can.publish && isDistrict }}
            onAction={(action) => open(action, module)}
          />
        ))}
      </div>
    );
  }

  const pendingModule = pending?.module;
  const schema = pendingModule?.configurationSchema as
    JsonSchemaNode | null | undefined;
  const hasFields = Object.keys(schema?.properties ?? {}).length > 0;
  const installError = install.error ?? activate.error;

  return (
    <>
      {header}
      {isDistrict && organizationId ? (
        <Tabs defaultValue="district">
          <TabsList>
            <TabsTrigger value="district">Para el distrito</TabsTrigger>
            <TabsTrigger value="clubs">En los clubes</TabsTrigger>
          </TabsList>
          <TabsContent value="district" className="mt-4">
            {body}
          </TabsContent>
          <TabsContent value="clubs" className="mt-4">
            <DistrictModulesOverview
              districtId={organizationId}
              modules={catalog.data ?? []}
            />
          </TabsContent>
        </Tabs>
      ) : (
        body
      )}

      {/* Install: with the configuration form when the module has one. */}
      {pending?.action === "install" && pendingModule && hasFields ? (
        <Dialog open onOpenChange={(next) => (next ? null : close())}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Instalar {pendingModule.name}</DialogTitle>
              <DialogDescription>
                Completá la configuración para {placeName}. Después la podés
                cambiar.
              </DialogDescription>
            </DialogHeader>
            <ModuleConfigurationForm
              schema={schema}
              fieldErrors={fieldErrorsOf(installError)}
              generalError={
                installError ? describeKernelError(installError) : null
              }
              submitLabel="Instalar y activar"
              isPending={install.isPending || activate.isPending}
              onSubmit={(value) => installAndActivate(pendingModule, value)}
              onCancel={close}
            />
          </DialogContent>
        </Dialog>
      ) : null}
      {pending?.action === "install" && pendingModule && !hasFields ? (
        <ConfirmationDialog
          open
          onOpenChange={(next) => (next ? null : close())}
          title={`Instalar ${pendingModule.name}`}
          description={`Queda activo para ${placeName}. Las personas con los cargos que el distrito eligió van a poder usarlo.`}
          confirmLabel="Instalar y activar"
          isPending={install.isPending || activate.isPending}
          errorMessage={
            installError ? describeKernelError(installError) : undefined
          }
          onConfirm={() => installAndActivate(pendingModule)}
        />
      ) : null}

      {pending?.action === "configure" && pendingModule ? (
        <Dialog open onOpenChange={(next) => (next ? null : close())}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Configurar {pendingModule.name}</DialogTitle>
              <DialogDescription>
                Configuración de {placeName}. Los cambios se aplican apenas
                guardás.
              </DialogDescription>
            </DialogHeader>
            <ModuleConfigurationForm
              schema={schema}
              initialValue={installationOf(pendingModule.id)?.configuration}
              fieldErrors={fieldErrorsOf(configure.error)}
              generalError={
                configure.error ? describeKernelError(configure.error) : null
              }
              submitLabel="Guardar"
              isPending={configure.isPending}
              onSubmit={(configuration) =>
                configure.mutate(
                  { ...target(pendingModule), configuration },
                  { onSuccess: close },
                )
              }
              onCancel={close}
            />
          </DialogContent>
        </Dialog>
      ) : null}

      {pending?.action === "activate" && pendingModule ? (
        <ConfirmationDialog
          open
          onOpenChange={(next) => (next ? null : close())}
          title={`Activar ${pendingModule.name}`}
          description={`Queda activo para ${placeName}.`}
          confirmLabel="Activar"
          isPending={activate.isPending}
          errorMessage={
            activate.error ? describeKernelError(activate.error) : undefined
          }
          onConfirm={() =>
            activate.mutate(target(pendingModule), { onSuccess: close })
          }
        />
      ) : null}

      {pending?.action === "suspend" && pendingModule ? (
        <ConfirmationDialog
          open
          onOpenChange={(next) => (next ? null : close())}
          title={`Desactivar ${pendingModule.name}`}
          description={`Nadie de ${placeName} va a poder usarlo hasta que lo vuelvas a activar. La configuración y los datos se conservan.`}
          confirmLabel="Desactivar"
          isPending={suspend.isPending}
          errorMessage={
            suspend.error ? describeKernelError(suspend.error) : undefined
          }
          onConfirm={() =>
            suspend.mutate(target(pendingModule), { onSuccess: close })
          }
        />
      ) : null}

      {pending?.action === "uninstall" && pendingModule ? (
        <ConfirmationDialog
          open
          onOpenChange={(next) => (next ? null : close())}
          title={`Desinstalar ${pendingModule.name}`}
          description={`Deja de estar disponible para ${placeName}. Lo que el módulo guardó no se borra, y lo podés volver a instalar cuando quieras.`}
          confirmLabel="Desinstalar"
          confirmVariant="danger"
          isPending={uninstall.isPending}
          errorMessage={
            uninstall.error ? describeKernelError(uninstall.error) : undefined
          }
          onConfirm={() =>
            uninstall.mutate(target(pendingModule), { onSuccess: close })
          }
        />
      ) : null}

      {publishing ? (
        <PublishModuleDialog
          open
          onOpenChange={(next) => (next ? null : setPublishing(null))}
          apps={apps.data ?? []}
          module={publishing.module}
        />
      ) : null}
    </>
  );
}

function fieldErrorsOf(error: unknown) {
  return error instanceof KernelApiError ? errorsByPath(error.fieldErrors) : {};
}
