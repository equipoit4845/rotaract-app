"use client";

import { useCan, useDeveloperApp, useOrganization } from "@/lib/api";
import { StatusBadge } from "@/components/domain/status-badge";
import {
  DataState,
  DetailGrid,
  DetailItem,
  EntityHero,
} from "@/components/layout";
import {
  Alert,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui";

import { describeKernelError } from "@/features/shell/kernel-error-message";

import { AppSecretsCard } from "../components/app-secrets-card";
import { AppStatusActions } from "../components/app-status-actions";
import { CopyableValue } from "../components/copy-button";
import { WebhooksPanel } from "../components/webhooks-panel";
import { EditDeveloperAppForm } from "../forms/edit-developer-app-form";
import {
  APP_TYPE_LABEL,
  dataLabel,
  describeCapabilities,
  formatDate,
} from "../utils/app-catalog";

function PlainList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="space-y-1">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

/**
 * `/developer/apps/[appId]`. Editing, secrets and status changes are gated
 * on `kernel.app.manage` in the app's own organization (UX only — the
 * Kernel evaluates the same permission there).
 */
export function DeveloperAppDetailContainer({ appId }: { appId: string }) {
  const query = useDeveloperApp(appId);
  const app = query.data;
  const organization = useOrganization(app?.organizationId);
  const canManage = useCan(
    "kernel.app.manage",
    app
      ? { scopeType: "ORGANIZATION", scopeId: app.organizationId }
      : undefined,
  );

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (query.isError || !app) {
    return <DataState kind="error" {...describeKernelError(query.error)} />;
  }

  const editable = canManage && app.status !== "REVOKED";

  return (
    <>
      <EntityHero
        title={app.name}
        subtitle={app.description ?? undefined}
        breadcrumb={[
          { label: "Apps", href: "/developer/apps" },
          { label: app.name },
        ]}
        badges={<StatusBadge kind="developerApp" status={app.status} />}
        actions={canManage ? <AppStatusActions app={app} /> : undefined}
      />

      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">Resumen</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
        </TabsList>
        <TabsContent value="webhooks" className="mt-4">
          <WebhooksPanel app={app} canManage={canManage} />
        </TabsContent>
        <TabsContent value="summary" className="mt-4">
          <div className="flex flex-col gap-4">
            {app.status === "SUSPENDED" ? (
              <Alert
                tone="warning"
                title="App pausada"
                description="No puede conectarse ni recibir ingresos de personas hasta que la reactives."
              />
            ) : null}
            {app.status === "REVOKED" ? (
              <Alert
                tone="danger"
                title="App revocada"
                description="Perdió el acceso de forma permanente. Si vuelve a hacer falta, registrala de nuevo."
              />
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>Resumen</CardTitle>
              </CardHeader>
              <CardContent>
                <DetailGrid>
                  <DetailItem
                    label="Identificador de la app (client_id)"
                    className="col-span-full"
                  >
                    <CopyableValue
                      value={app.clientId}
                      copyLabel="Copiar identificador"
                    />
                  </DetailItem>
                  <DetailItem label="Tipo">
                    {APP_TYPE_LABEL[app.type]}
                  </DetailItem>
                  <DetailItem label="Organización">
                    {organization.data?.name ??
                      (organization.isLoading ? "…" : "")}
                  </DetailItem>
                  <DetailItem label="Registrada">
                    {formatDate(app.createdAt)}
                  </DetailItem>
                  <DetailItem label="Qué puede hacer">
                    <PlainList items={describeCapabilities(app)} />
                  </DetailItem>
                  <DetailItem label="Datos que puede leer">
                    <PlainList items={app.scopes.map(dataLabel)} />
                  </DetailItem>
                  <DetailItem label="Direcciones de regreso">
                    {app.redirectUris.length > 0 ? (
                      <ul className="space-y-1">
                        {app.redirectUris.map((uri) => (
                          <li key={uri} className="break-all font-mono text-xs">
                            {uri}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </DetailItem>
                </DetailGrid>
              </CardContent>
            </Card>

            {app.type === "CONFIDENTIAL" ? (
              <AppSecretsCard app={app} canManage={canManage} />
            ) : null}

            {editable ? (
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Editar app</CardTitle>
                    <CardDescription>
                      Lo que la app puede hacer se define al registrarla; acá
                      cambiás su nombre, los datos que lee y sus direcciones de
                      regreso.
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <EditDeveloperAppForm app={app} />
                </CardContent>
              </Card>
            ) : null}
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
