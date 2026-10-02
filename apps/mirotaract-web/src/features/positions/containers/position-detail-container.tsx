"use client";

import { useCan, useOrganization, usePositionDefinitions } from "@/lib/api";
import {
  DataState,
  DetailGrid,
  DetailItem,
  EntityHero,
} from "@/components/layout";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from "@/components/ui";

import { describeKernelError } from "@/features/shell/kernel-error-message";

import {
  positionScopeToLabel,
  positionScopeToTone,
} from "../adapters/position-scope-to-label";
import { PositionPermissionsPanel } from "../components/position-permissions-panel";
import { EditPositionForm } from "../forms/edit-position-form";
import { formatDate } from "../utils/format-date";

function Field({
  label,
  value,
}: {
  label: string;
  value: string | undefined | null;
}) {
  return <DetailItem label={label}>{value}</DetailItem>;
}

/**
 * `listPositionDefinitions` is the only Positions read hook
 * (`kernel-openapi.yaml` has no `GET /position-definitions/{id}`) — the
 * catalog is small and bounded by an organization's own configurable +
 * system cargos, so resolving a single position by scanning the already
 * public, already-cached list is the same class of bounded lookup as
 * `DistrictDashboard`'s `positionsById` map, not a per-row N+1 pattern.
 */
export function PositionDetailContainer({
  positionDefinitionId,
}: {
  positionDefinitionId: string;
}) {
  const positions = usePositionDefinitions();
  const position = positions.data?.find((p) => p.id === positionDefinitionId);
  const owner = useOrganization(position?.ownerOrganizationId ?? undefined);
  const canEdit =
    useCan(position?.editPermissionCode ?? "kernel.position.manage", {
      scopeType: "ORGANIZATION_TREE",
      scopeId: position?.ownerOrganizationId ?? undefined,
    }) && !position?.isSystem;

  if (positions.isLoading) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--mr-space-3)",
        }}
      >
        <Skeleton style={{ height: "2rem" }} />
        <Skeleton style={{ height: "12rem" }} />
      </div>
    );
  }

  if (positions.isError) {
    return <DataState kind="error" {...describeKernelError(positions.error)} />;
  }

  if (!position) {
    return (
      <DataState
        kind="empty"
        title="Cargo no encontrado"
        description="No encontramos el cargo que buscás."
      />
    );
  }

  return (
    <>
      <EntityHero
        title={position.name}
        subtitle={position.code}
        breadcrumb={[
          { label: "Cargos", href: "/positions" },
          { label: position.name },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle>Resumen</CardTitle>
        </CardHeader>
        <CardContent>
          <DetailGrid>
            <Field label="Código" value={position.code} />
            <DetailItem label="Alcance">
              <Badge tone={positionScopeToTone(position.organizationType)}>
                {positionScopeToLabel(position.organizationType)}
              </Badge>
            </DetailItem>
            <Field
              label="Distrito propietario"
              value={
                position.ownerOrganizationId
                  ? (owner.data?.name ?? "…")
                  : "Sin propietario (sistema)"
              }
            />
            <Field
              label="Permiso de edición"
              value={position.editPermissionCode}
            />
            <Field label="Rol técnico" value={position.defaultRoleCode} />
            <Field
              label="Singleton por período"
              value={position.isSingletonPerPeriod ? "Sí" : "No"}
            />
            <Field
              label="Cargo de sistema"
              value={position.isSystem ? "Sí" : "No"}
            />
            <Field label="Creado" value={formatDate(position.createdAt)} />
            <Field label="Actualizado" value={formatDate(position.updatedAt)} />
          </DetailGrid>
          {position.description ? (
            <p style={{ marginTop: "var(--mr-space-4)" }}>
              {position.description}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {position.isSystem ? (
        <div style={{ marginTop: "var(--mr-space-4)" }}>
          <DataState
            kind="empty"
            title="Cargo de sistema"
            description="Los cargos de sistema no se editan ni se eliminan desde un distrito (invariante 6.6.1.2)."
          />
        </div>
      ) : canEdit ? (
        <div
          style={{
            marginTop: "var(--mr-space-4)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--mr-space-4)",
          }}
        >
          <Card>
            <CardHeader>
              <CardTitle>Editar cargo</CardTitle>
            </CardHeader>
            <CardContent>
              <EditPositionForm position={position} />
            </CardContent>
          </Card>
          <PositionPermissionsPanel position={position} />
        </div>
      ) : null}
    </>
  );
}
