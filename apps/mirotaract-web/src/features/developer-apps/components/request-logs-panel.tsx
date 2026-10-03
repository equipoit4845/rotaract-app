"use client";

import type { DeveloperApp, RequestLogFilters } from "@/lib/api";
import { useRequestLogs } from "@/lib/api";
import { DataState } from "@/components/layout";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FormField,
  Input,
  Select,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import { RefreshCw, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { describeKernelError } from "@/features/shell/kernel-error-message";

import { formatDateTime } from "../utils/app-catalog";
import {
  STATUS_FILTERS,
  describeWindow,
  statusHint,
  statusTone,
} from "../utils/request-log-labels";

/**
 * "Registros" tab (E9.3): the requests this app made to the Kernel in the
 * last 30 days. Filters by status class, error code and traceId; a time
 * window arrives from other tabs (e.g. a failed webhook delivery).
 */
export function RequestLogsPanel({
  app,
  initialFilters,
}: {
  app: Pick<DeveloperApp, "id" | "name">;
  initialFilters?: RequestLogFilters;
}) {
  const [filters, setFilters] = useState<RequestLogFilters>(
    initialFilters ?? {},
  );
  const [draft, setDraft] = useState({
    code: initialFilters?.code ?? "",
    traceId: initialFilters?.traceId ?? "",
  });

  // A new jump from another tab replaces the current filters.
  useEffect(() => {
    if (!initialFilters) return;
    setFilters(initialFilters);
    setDraft({
      code: initialFilters.code ?? "",
      traceId: initialFilters.traceId ?? "",
    });
  }, [initialFilters]);

  const logs = useRequestLogs(app.id, filters);
  const items = logs.data?.pages.flatMap((page) => page.items) ?? [];
  const period = describeWindow(filters);

  function apply(event: FormEvent) {
    event.preventDefault();
    setFilters((current) => ({
      ...current,
      code: draft.code.trim() || undefined,
      traceId: draft.traceId.trim() || undefined,
    }));
  }

  function filterByTrace(traceId: string) {
    setDraft((current) => ({ ...current, traceId }));
    setFilters((current) => ({ ...current, traceId }));
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Registros</CardTitle>
          <CardDescription>
            Los pedidos que hizo esta app al kernel en los últimos 30 días. No
            guardamos cuerpos, tokens ni datos personales: solo la ruta, el
            resultado, la demora y el traceId.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          onSubmit={apply}
          className="grid gap-3 sm:grid-cols-[12rem_1fr_1fr_auto] sm:items-end"
          aria-label="Filtrar registros"
        >
          <FormField label="Resultado" htmlFor="request-logs-status">
            <Select
              id="request-logs-status"
              value={filters.status ?? ""}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  status: event.target.value || undefined,
                }))
              }
            >
              {STATUS_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Código de error" htmlFor="request-logs-code">
            <Input
              id="request-logs-code"
              placeholder="KERNEL_HTTP_403, invalid_client…"
              value={draft.code}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  code: event.target.value,
                }))
              }
            />
          </FormField>
          <FormField label="traceId" htmlFor="request-logs-trace">
            <Input
              id="request-logs-trace"
              className="font-mono"
              placeholder="El traceId de un error"
              value={draft.traceId}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  traceId: event.target.value,
                }))
              }
            />
          </FormField>
          <div className="flex gap-2">
            <Button type="submit">Filtrar</Button>
            <Button
              type="button"
              variant="outline"
              aria-label="Actualizar registros"
              leadingIcon={<RefreshCw className="size-4" aria-hidden />}
              onClick={() => void logs.refetch()}
              disabled={logs.isFetching}
            >
              Actualizar
            </Button>
          </div>
        </form>

        {period ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Período:</span>
            <Badge tone="info">{period}</Badge>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              leadingIcon={<X className="size-4" aria-hidden />}
              onClick={() =>
                setFilters((current) => ({
                  ...current,
                  from: undefined,
                  to: undefined,
                }))
              }
            >
              Quitar período
            </Button>
          </div>
        ) : null}

        {logs.isLoading ? (
          <Skeleton className="h-32" />
        ) : logs.isError ? (
          <DataState kind="error" {...describeKernelError(logs.error)} />
        ) : items.length === 0 ? (
          <DataState
            kind="empty"
            title="No hay registros con estos filtros"
            description="Cuando la app llame a la API con su token (o pida uno), sus pedidos aparecen acá en unos segundos."
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cuándo</TableHead>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Resultado</TableHead>
                  <TableHead>Demora</TableHead>
                  <TableHead>traceId</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((log) => {
                  const hint = statusHint(log.status);
                  return (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap">
                        {formatDateTime(log.createdAt)}
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs">
                          <span className="font-semibold">{log.method}</span>{" "}
                          {log.route}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge tone={statusTone(log.status)}>
                          {log.status}
                        </Badge>
                        {log.code ? (
                          <span className="mt-1 block font-mono text-xs">
                            {log.code}
                          </span>
                        ) : null}
                        {hint ? (
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {hint}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {log.latencyMs} ms
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          className="max-w-48 truncate font-mono text-xs text-primary underline-offset-2 hover:underline"
                          title={`Filtrar por ${log.traceId}`}
                          onClick={() => filterByTrace(log.traceId)}
                        >
                          {log.traceId}
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {logs.hasNextPage ? (
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void logs.fetchNextPage()}
                  disabled={logs.isFetchingNextPage}
                >
                  Ver más
                </Button>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
