"use client";

import type {
  DeveloperApp,
  EventCatalogEntry,
  WebhookEndpoint,
} from "@/lib/api";
import {
  useDeleteWebhookEndpoint,
  useEventCatalog,
  useRotateWebhookSecret,
  useSendWebhookTest,
  useUpdateWebhookEndpoint,
  useWebhookEndpoints,
} from "@/lib/api";
import { ConfirmationDialog, DataState } from "@/components/layout";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Separator,
  Skeleton,
  Switch,
} from "@/components/ui";
import { Plus, Send, KeyRound, Trash2, Pencil } from "lucide-react";
import { useState } from "react";

import { describeKernelError } from "@/features/shell/kernel-error-message";

import { WebhookEndpointForm } from "../forms/webhook-endpoint-form";
import { formatDateTime } from "../utils/app-catalog";
import {
  endpointState,
  eventTitle,
  subscribableEvents,
} from "../utils/webhook-labels";
import { SecretRevealDialog } from "./secret-reveal-dialog";
import { WebhookDeliveriesTable } from "./webhook-deliveries-table";

type RevealedSecret = { title: string; description: string; secret: string };

/**
 * "Webhooks" tab of an app: where Mi Rotaract sends signed notices when
 * something changes (a new member, a new president...), so the app does
 * not have to ask every few minutes.
 */
export function WebhooksPanel({
  app,
  canManage,
}: {
  app: DeveloperApp;
  canManage: boolean;
}) {
  const endpoints = useWebhookEndpoints(app.id);
  const catalog = useEventCatalog();
  const events = subscribableEvents(catalog.data?.events);
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<RevealedSecret | null>(null);
  const editable = canManage && app.status !== "REVOKED";

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Webhooks</CardTitle>
            <CardDescription>
              Mi Rotaract le avisa a tu servidor cuando pasa algo (un socio
              nuevo, una baja, un cambio de autoridades), en vez de que la app
              tenga que preguntar cada tanto. Cada aviso va firmado para que tu
              servidor pueda comprobar que viene de Mi Rotaract. Si tu servidor
              no responde, lo reintentamos durante 3 días.
            </CardDescription>
          </div>
          {editable && !creating ? (
            <Button
              type="button"
              leadingIcon={<Plus className="size-4" aria-hidden />}
              onClick={() => setCreating(true)}
              disabled={!catalog.data}
            >
              Agregar endpoint
            </Button>
          ) : null}
        </CardHeader>
        {creating ? (
          <CardContent>
            <WebhookEndpointForm
              app={app}
              events={events}
              onCancel={() => setCreating(false)}
              onCreated={(created) => {
                setCreating(false);
                setRevealed({
                  title: "Endpoint agregado",
                  description:
                    "Este es el secreto de firma. Tu servidor lo usa para comprobar que cada aviso viene de Mi Rotaract.",
                  secret: created.secret,
                });
              }}
            />
          </CardContent>
        ) : null}
      </Card>

      {endpoints.isLoading || catalog.isLoading ? (
        <Skeleton className="h-40" />
      ) : endpoints.isError ? (
        <DataState kind="error" {...describeKernelError(endpoints.error)} />
      ) : (endpoints.data ?? []).length === 0 ? (
        <DataState
          kind="empty"
          title="Sin endpoints"
          description={
            editable
              ? "Agregá la dirección de tu servidor para empezar a recibir avisos."
              : "Esta app todavía no recibe avisos."
          }
        />
      ) : (
        (endpoints.data ?? []).map((endpoint) => (
          <EndpointCard
            key={endpoint.id}
            app={app}
            endpoint={endpoint}
            catalog={catalog.data?.events}
            events={events}
            canManage={editable}
            onSecret={setRevealed}
          />
        ))
      )}

      {revealed ? (
        <SecretRevealDialog
          open
          title={revealed.title}
          description={revealed.description}
          secret={revealed.secret}
          secretLabel="Secreto de firma (whsec_…)"
          note={
            <span>
              Guardalo en tu servidor (por ejemplo en la variable{" "}
              <code className="font-mono">MIROTARACT_WEBHOOK_SECRET</code>) y
              verificá cada aviso con el SDK:{" "}
              <code className="font-mono">verifyWebhook</code> en JavaScript o{" "}
              <code className="font-mono">verify_webhook</code> en Python.
            </span>
          }
          onDone={() => setRevealed(null)}
        />
      ) : null}
    </div>
  );
}

function EndpointCard({
  app,
  endpoint,
  catalog,
  events,
  canManage,
  onSecret,
}: {
  app: DeveloperApp;
  endpoint: WebhookEndpoint;
  catalog: EventCatalogEntry[] | undefined;
  events: EventCatalogEntry[];
  canManage: boolean;
  onSecret: (secret: RevealedSecret) => void;
}) {
  const update = useUpdateWebhookEndpoint();
  const rotate = useRotateWebhookSecret();
  const remove = useDeleteWebhookEndpoint();
  const test = useSendWebhookTest();
  const [editing, setEditing] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const state = endpointState(endpoint);
  const path = { appId: app.id, endpointId: endpoint.id };
  const enabled = endpoint.status === "ENABLED";
  const actionError = [update, test].find((m) => m.isError)?.error;

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle className="flex flex-wrap items-center gap-2">
            <span className="break-all font-mono text-sm">{endpoint.url}</span>
            <Badge tone={state.tone}>{state.label}</Badge>
          </CardTitle>
          {endpoint.description ? (
            <CardDescription>{endpoint.description}</CardDescription>
          ) : null}
        </div>
        {canManage ? (
          <div className="flex items-center gap-2">
            <Switch
              id={`webhook-enabled-${endpoint.id}`}
              checked={enabled}
              disabled={update.isPending}
              onCheckedChange={(checked) =>
                update.mutate({
                  ...path,
                  payload: { status: checked ? "ENABLED" : "DISABLED" },
                })
              }
            />
            <label
              htmlFor={`webhook-enabled-${endpoint.id}`}
              className="text-sm"
            >
              {enabled ? "Activo" : "Desactivado"}
            </label>
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {endpoint.disabledReason === "AUTO_FAILURES" ? (
          <Alert
            tone="danger"
            title="Lo desactivamos porque falló durante 3 días seguidos"
            description="Tu servidor no respondió bien a ningún aviso en las últimas 72 horas. Revisá que la dirección funcione, mandá una prueba y volvé a activarlo. Los avisos de mientras no se guardaron: usá la API de datos (updatedSince) para ponerte al día."
          />
        ) : endpoint.failingSince ? (
          <Alert
            tone="warning"
            title="Tu servidor está fallando"
            description={`Desde ${formatDateTime(endpoint.failingSince)} no responde bien (${endpoint.consecutiveFailures} intentos fallidos). Seguimos reintentando; si sigue así 3 días, lo desactivamos.`}
          />
        ) : null}

        {editing ? (
          <WebhookEndpointForm
            app={app}
            events={events}
            endpoint={endpoint}
            onCancel={() => setEditing(false)}
            onSaved={() => setEditing(false)}
          />
        ) : (
          <div className="grid gap-3 text-sm md:grid-cols-3">
            <div className="md:col-span-2">
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                Avisos que recibe
              </p>
              <ul className="space-y-1">
                {endpoint.eventTypes.map((type) => (
                  <li key={type}>
                    {eventTitle(catalog, type)}{" "}
                    <span className="font-mono text-xs text-muted-foreground">
                      {type}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-2">
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Secreto de firma
                </p>
                <p className="font-mono">••••{endpoint.secretHint}</p>
                {endpoint.previousSecretExpiresAt ? (
                  <p className="text-xs text-muted-foreground">
                    El anterior sigue firmando hasta{" "}
                    {formatDateTime(endpoint.previousSecretExpiresAt)}.
                  </p>
                ) : null}
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Última entrega correcta
                </p>
                <p>{formatDateTime(endpoint.lastSuccessAt) ?? "Ninguna"}</p>
              </div>
            </div>
          </div>
        )}

        {canManage && !editing ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              leadingIcon={<Send className="size-4" aria-hidden />}
              disabled={!enabled || test.isPending}
              onClick={() => test.mutate(path)}
            >
              {test.isPending ? "Enviando…" : "Enviar prueba"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              leadingIcon={<Pencil className="size-4" aria-hidden />}
              onClick={() => setEditing(true)}
            >
              Editar
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              leadingIcon={<KeyRound className="size-4" aria-hidden />}
              onClick={() => {
                rotate.reset();
                setConfirmRotate(true);
              }}
            >
              Crear secreto nuevo
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              leadingIcon={<Trash2 className="size-4" aria-hidden />}
              onClick={() => {
                remove.reset();
                setConfirmDelete(true);
              }}
            >
              Borrar
            </Button>
          </div>
        ) : null}
        {test.isSuccess ? (
          <Alert
            tone="info"
            title="Prueba en camino"
            description="Le mandamos un aviso de prueba (ping.v1). En unos segundos lo vas a ver en la lista de envíos."
          />
        ) : null}
        {actionError ? (
          <Alert tone="danger" {...describeKernelError(actionError)} />
        ) : null}

        <Separator />
        <WebhookDeliveriesTable
          appId={app.id}
          endpointId={endpoint.id}
          catalog={catalog}
          canManage={canManage && enabled}
        />
      </CardContent>

      <ConfirmationDialog
        open={confirmRotate}
        onOpenChange={setConfirmRotate}
        title="Crear secreto de firma nuevo"
        description="Vamos a generar un secreto nuevo y mostrártelo una sola vez. Durante 24 horas los avisos llevan las dos firmas (la nueva y la anterior), así tenés tiempo de actualizar tu servidor."
        confirmLabel="Crear secreto"
        isPending={rotate.isPending}
        errorMessage={
          rotate.isError ? describeKernelError(rotate.error) : undefined
        }
        onConfirm={() =>
          rotate.mutate(path, {
            onSuccess: (rotated) => {
              setConfirmRotate(false);
              onSecret({
                title: "Secreto de firma nuevo",
                description: `Este es el secreto nuevo de ${endpoint.url}.`,
                secret: rotated.secret,
              });
            },
          })
        }
      />
      <ConfirmationDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Borrar endpoint"
        description="Tu servidor deja de recibir avisos en esta dirección y se borra su historial de envíos. No se puede deshacer."
        confirmLabel="Borrar"
        confirmVariant="danger"
        isPending={remove.isPending}
        errorMessage={
          remove.isError ? describeKernelError(remove.error) : undefined
        }
        onConfirm={() =>
          remove.mutate(path, { onSuccess: () => setConfirmDelete(false) })
        }
      />
    </Card>
  );
}
