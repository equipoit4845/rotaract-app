"use client";

import type { DeveloperApp, DeveloperAppQuota } from "@/lib/api";
import { useDeveloperAppQuota, useUpdateDeveloperAppQuota } from "@/lib/api";
import { DataState } from "@/components/layout";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FormField,
  Input,
  Progress,
  Skeleton,
} from "@/components/ui";
import { RefreshCw } from "lucide-react";
import { useState, type FormEvent } from "react";

import { describeKernelError } from "@/features/shell/kernel-error-message";

import {
  QUOTA_SOURCE_LABEL,
  formatNumber,
  formatWait,
} from "../utils/governance-labels";

function Usage({
  label,
  window,
}: {
  label: string;
  window: DeveloperAppQuota["perMinute"];
}) {
  const percent = Math.min(100, Math.round((window.used / window.limit) * 100));
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {formatNumber(window.used)} de {formatNumber(window.limit)} · se
          renueva en {formatWait(window.resetsInSeconds)}
        </span>
      </div>
      <Progress value={percent} aria-label={`${label}: ${percent}% usado`} />
    </div>
  );
}

function QuotaForm({
  app,
  quota,
}: {
  app: DeveloperApp;
  quota: DeveloperAppQuota;
}) {
  const update = useUpdateDeveloperAppQuota();
  const [perMinute, setPerMinute] = useState(
    app.quotaPerMinute != null ? String(app.quotaPerMinute) : "",
  );
  const [perDay, setPerDay] = useState(
    app.quotaPerDay != null ? String(app.quotaPerDay) : "",
  );
  const [error, setError] = useState<string>();

  function parse(value: string): number | null | undefined {
    if (!value.trim()) return null;
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : undefined;
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const minute = parse(perMinute);
    const day = parse(perDay);
    if (minute === undefined || day === undefined) {
      setError("Escribí números enteros mayores que cero, o dejalo vacío.");
      return;
    }
    if (minute !== null && day !== null && day < minute) {
      setError("El límite por día no puede ser menor que el de por minuto.");
      return;
    }
    setError(undefined);
    update.mutate({
      appId: app.id,
      payload: { perMinute: minute, perDay: day },
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
      <p className="text-sm text-muted-foreground">
        Vacío = el valor del distrito ({formatNumber(quota.defaults.perMinute)}{" "}
        por minuto, {formatNumber(quota.defaults.perDay)} por día).
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Pedidos por minuto" htmlFor="quota-minute">
          <Input
            id="quota-minute"
            inputMode="numeric"
            value={perMinute}
            onChange={(event) => setPerMinute(event.target.value)}
          />
        </FormField>
        <FormField label="Pedidos por día" htmlFor="quota-day">
          <Input
            id="quota-day"
            inputMode="numeric"
            value={perDay}
            onChange={(event) => setPerDay(event.target.value)}
          />
        </FormField>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {update.isError ? (
        <Alert tone="danger" {...describeKernelError(update.error)} />
      ) : null}
      <div>
        <Button type="submit" disabled={update.isPending}>
          Guardar límites
        </Button>
      </div>
    </form>
  );
}

/**
 * "Límites" tab (E11.3): how much of its per-minute and per-day quota the
 * app used; the RDR can set the app's own limits.
 */
export function QuotaPanel({
  app,
  canReview,
}: {
  app: DeveloperApp;
  canReview: boolean;
}) {
  const quota = useDeveloperAppQuota(app.id);
  if (quota.isLoading) return <Skeleton className="h-40" />;
  if (quota.isError || !quota.data)
    return <DataState kind="error" {...describeKernelError(quota.error)} />;
  const data = quota.data;
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Uso de la app</CardTitle>
            <CardDescription>
              {QUOTA_SOURCE_LABEL[data.source]}. Al pasarse, el kernel responde
              429 y dice cuánto esperar; los SDKs reintentan solos.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            leadingIcon={<RefreshCw className="size-3.5" aria-hidden />}
            onClick={() => void quota.refetch()}
          >
            Actualizar
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!data.enabled ? (
            <Alert
              tone="warning"
              title="Los límites por app están apagados en este kernel"
            />
          ) : null}
          <Usage label="Este minuto" window={data.perMinute} />
          <Usage label="Hoy (UTC)" window={data.perDay} />
        </CardContent>
      </Card>
      {canReview ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Límites propios</CardTitle>
              <CardDescription>
                Solo el RDR los cambia. Tené en cuenta que el kernel también
                limita a 120 pedidos por minuto por dirección IP.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <QuotaForm app={app} quota={data} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
