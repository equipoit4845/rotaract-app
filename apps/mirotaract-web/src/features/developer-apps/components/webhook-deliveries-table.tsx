"use client";

import type { EventCatalogEntry, WebhookDeliveryStatus } from "@/lib/api";
import { useRedeliverWebhook, useWebhookDeliveries } from "@/lib/api";
import { DataState } from "@/components/layout";
import {
  Alert,
  Badge,
  Button,
  Select,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import { RefreshCw } from "lucide-react";
import { useState } from "react";

import { describeKernelError } from "@/features/shell/kernel-error-message";

import { formatDateTime } from "../utils/app-catalog";
import { useAppNavigation } from "../utils/app-navigation";
import { logsAroundAttempt } from "../utils/request-log-labels";
import {
  DELIVERY_STATUS,
  describeAttempt,
  eventTitle,
} from "../utils/webhook-labels";

/** Last 25 deliveries of an endpoint, with "Reenviar". Refreshes itself while some are pending. */
export function WebhookDeliveriesTable({
  appId,
  endpointId,
  catalog,
  canManage,
}: {
  appId: string;
  endpointId: string;
  catalog: EventCatalogEntry[] | undefined;
  canManage: boolean;
}) {
  const [status, setStatus] = useState<WebhookDeliveryStatus | "">("");
  const deliveries = useWebhookDeliveries(
    appId,
    endpointId,
    status || undefined,
  );
  const redeliver = useRedeliverWebhook();
  const navigation = useAppNavigation();
  const [redelivering, setRedelivering] = useState<string | null>(null);
  const items = deliveries.data?.items ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-medium">Últimos envíos</h4>
        <div className="flex items-center gap-2">
          <label
            className="sr-only"
            htmlFor={`deliveries-status-${endpointId}`}
          >
            Mostrar
          </label>
          <Select
            id={`deliveries-status-${endpointId}`}
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as WebhookDeliveryStatus | "")
            }
          >
            <option value="">Todos</option>
            <option value="SUCCEEDED">Entregados</option>
            <option value="PENDING">Reintentando</option>
            <option value="FAILED">No se pudieron entregar</option>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            leadingIcon={<RefreshCw className="size-4" aria-hidden />}
            onClick={() => void deliveries.refetch()}
            disabled={deliveries.isFetching}
          >
            Actualizar
          </Button>
        </div>
      </div>

      {redeliver.isError ? (
        <Alert tone="danger" {...describeKernelError(redeliver.error)} />
      ) : null}

      {deliveries.isLoading ? (
        <Skeleton className="h-24" />
      ) : deliveries.isError ? (
        <DataState kind="error" {...describeKernelError(deliveries.error)} />
      ) : items.length === 0 ? (
        <DataState
          kind="empty"
          title="Todavía no hay envíos"
          description="Cuando pase algo en el club (o mandes una prueba), lo vas a ver acá."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cuándo</TableHead>
              <TableHead>Aviso</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Respuesta</TableHead>
              <TableHead>Intentos</TableHead>
              {canManage ? (
                <TableHead className="text-right">Acción</TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((delivery) => {
              const state = DELIVERY_STATUS[delivery.status];
              return (
                <TableRow key={delivery.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatDateTime(delivery.createdAt)}
                  </TableCell>
                  <TableCell>
                    <span className="block">
                      {eventTitle(catalog, delivery.eventType)}
                    </span>
                    <span className="block font-mono text-xs text-muted-foreground">
                      {delivery.eventId}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge tone={state.tone}>{state.label}</Badge>
                    {delivery.status === "PENDING" && delivery.nextAttemptAt ? (
                      <span className="mt-1 block text-xs text-muted-foreground">
                        Próximo intento:{" "}
                        {formatDateTime(delivery.nextAttemptAt)}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell
                    className="max-w-64 text-xs"
                    title={delivery.lastResponseBody ?? undefined}
                  >
                    {describeAttempt(delivery)}
                    {navigation &&
                    delivery.status !== "SUCCEEDED" &&
                    logsAroundAttempt(delivery.lastAttemptAt) ? (
                      <button
                        type="button"
                        className="mt-1 block text-primary underline-offset-2 hover:underline"
                        title="Los pedidos que hizo tu app al kernel 10 minutos antes y después de este intento"
                        onClick={() =>
                          navigation.showRequestLogs(
                            logsAroundAttempt(delivery.lastAttemptAt)!,
                          )
                        }
                      >
                        Ver registros de ese momento
                      </button>
                    ) : null}
                  </TableCell>
                  <TableCell>{delivery.attempts}</TableCell>
                  {canManage ? (
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={
                          (redeliver.isPending &&
                            redelivering === delivery.id) ||
                          (delivery.status === "PENDING" &&
                            delivery.attempts === 0)
                        }
                        aria-label={`Reenviar el aviso ${delivery.eventId}`}
                        onClick={() => {
                          setRedelivering(delivery.id);
                          redeliver.mutate({
                            appId,
                            endpointId,
                            deliveryId: delivery.id,
                          });
                        }}
                      >
                        Reenviar
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
