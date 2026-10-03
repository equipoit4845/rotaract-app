"use client";

import type { StatusIncident, StatusIncidentFilter } from "@/lib/api";
import { useCan, useStatusIncidents, useStatusSummary } from "@/lib/api";
import { DataState, PageHeader } from "@/components/layout";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Select,
  Skeleton,
} from "@/components/ui";
import { CalendarClock, ExternalLink, Siren } from "lucide-react";
import { useState } from "react";

import { useActiveOrganizationContext } from "@/features/shell/active-organization-context";
import { describeKernelError } from "@/features/shell/kernel-error-message";

import { IncidentUpdateForm } from "../forms/incident-update-form";
import { NewIncidentForm } from "../forms/new-incident-form";
import {
  COMPONENT_LABELS,
  formatInstant,
  impactLabel,
  isClosed,
  levelLabel,
  stateLabel,
} from "../utils/status-labels";

const PUBLIC_STATUS_URL = "https://developers.rotaract4845.com/estado";

/**
 * `/developer/estado` — E12.1. The district (RDR) and SUPERADMIN publish
 * incidents and announce maintenances; developers read them on the public
 * status page. The Kernel enforces kernel.status.manage on every call.
 */
export function StatusAdminContainer() {
  const { organizationId } = useActiveOrganizationContext();
  // The RDR's grant is ORGANIZATION_TREE on the district: evaluate it at the
  // active organization, like the navigation does.
  const canManage = useCan(
    "kernel.status.manage",
    organizationId
      ? { scopeType: "ORGANIZATION", scopeId: organizationId }
      : undefined,
  );
  const summary = useStatusSummary();
  const [filter, setFilter] = useState<StatusIncidentFilter>("open");
  const incidents = useStatusIncidents(filter);
  const [creating, setCreating] = useState<StatusIncident["kind"] | null>(null);
  const [updating, setUpdating] = useState<StatusIncident | null>(null);

  return (
    <>
      <PageHeader
        title="Estado del servicio"
        description="Lo que ven los equipos que construyen sobre Mi Rotaract: si cada servicio funciona, los incidentes y los mantenimientos anunciados."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="ghost"
              leadingIcon={<ExternalLink className="size-4" aria-hidden />}
              onClick={() =>
                window.open(PUBLIC_STATUS_URL, "_blank", "noopener")
              }
            >
              Página pública
            </Button>
            {canManage ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  leadingIcon={<CalendarClock className="size-4" aria-hidden />}
                  onClick={() => setCreating("MAINTENANCE")}
                >
                  Anunciar mantenimiento
                </Button>
                <Button
                  type="button"
                  leadingIcon={<Siren className="size-4" aria-hidden />}
                  onClick={() => setCreating("INCIDENT")}
                >
                  Abrir incidente
                </Button>
              </>
            ) : null}
          </div>
        }
      />

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Ahora</CardTitle>
          <CardDescription>
            {summary.data
              ? summary.data.description
              : "Medido por el worker cada minuto."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {summary.isLoading ? (
            <Skeleton className="h-24" />
          ) : summary.isError ? (
            <p className="text-sm text-destructive">
              {describeKernelError(summary.error).title}
            </p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {summary.data?.components.map((component) => {
                const level = levelLabel(component.status);
                return (
                  <li
                    key={component.key}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {component.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {component.uptime90d === null
                          ? "Sin historial todavía"
                          : `${component.uptime90d.toFixed(2)} % en 90 días`}
                      </p>
                    </div>
                    <Badge tone={level.tone}>{level.label}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Incidentes y mantenimientos</h2>
        <Select
          aria-label="Filtrar"
          className="w-44"
          value={filter}
          onChange={(e) => setFilter(e.target.value as StatusIncidentFilter)}
        >
          <option value="open">Abiertos y programados</option>
          <option value="closed">Cerrados</option>
          <option value="all">Todos</option>
        </Select>
      </div>

      <div className="mt-3 flex flex-col gap-3">
        {incidents.isLoading ? (
          <Skeleton className="h-24" />
        ) : incidents.isError ? (
          <DataState
            kind="error"
            title={describeKernelError(incidents.error).title}
          />
        ) : incidents.data?.length ? (
          incidents.data.map((incident) => (
            <IncidentCard
              key={incident.id}
              incident={incident}
              canManage={canManage}
              onUpdate={() => setUpdating(incident)}
            />
          ))
        ) : (
          <DataState
            title={
              filter === "closed" ? "Nada cerrado todavía" : "Todo en orden"
            }
            description="No hay incidentes abiertos ni mantenimientos programados."
          />
        )}
      </div>

      <Dialog
        open={creating !== null}
        onOpenChange={(open) => !open && setCreating(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {creating === "MAINTENANCE"
                ? "Anunciar un mantenimiento"
                : "Abrir un incidente"}
            </DialogTitle>
            <DialogDescription>
              {creating === "MAINTENANCE"
                ? "Un corte planificado. Se publica ya y empieza y termina solo a la hora indicada."
                : "Algo ya está fallando. Publicá lo que sabés y actualizalo a medida que avanza."}
            </DialogDescription>
          </DialogHeader>
          {creating ? (
            <NewIncidentForm
              kind={creating}
              onCreated={() => setCreating(null)}
              onCancel={() => setCreating(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={updating !== null}
        onOpenChange={(open) => !open && setUpdating(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publicar una actualización</DialogTitle>
            <DialogDescription>{updating?.title}</DialogDescription>
          </DialogHeader>
          {updating ? (
            <IncidentUpdateForm
              incident={updating}
              onDone={() => setUpdating(null)}
              onCancel={() => setUpdating(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function IncidentCard({
  incident,
  canManage,
  onUpdate,
}: {
  incident: StatusIncident;
  canManage: boolean;
  onUpdate: () => void;
}) {
  const state = stateLabel(incident.state);
  const isMaintenance = incident.kind === "MAINTENANCE";
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base">{incident.title}</CardTitle>
            <CardDescription>
              {isMaintenance
                ? `Mantenimiento · ${formatInstant(incident.scheduledStart)} → ${formatInstant(incident.scheduledEnd)}`
                : `Incidente · impacto ${impactLabel(incident.impact).toLowerCase()} · desde ${formatInstant(incident.startedAt ?? incident.createdAt)}`}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={state.tone}>{state.label}</Badge>
            {canManage && !isClosed(incident) ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={onUpdate}
              >
                Actualizar
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-xs text-muted-foreground">
          {incident.components
            .map((key) => COMPONENT_LABELS[key] ?? key)
            .join(" · ")}
        </p>
        <ol className="space-y-2 border-l border-border pl-4">
          {incident.updates.map((update) => (
            <li key={update.id} className="text-sm">
              <span className="font-medium">
                {stateLabel(update.state).label}
              </span>
              <span className="ml-2 text-xs text-muted-foreground">
                {formatInstant(update.createdAt)}
              </span>
              <p className="mt-0.5 whitespace-pre-line text-muted-foreground">
                {update.message}
              </p>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
