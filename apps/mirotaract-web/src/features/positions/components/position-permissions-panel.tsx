"use client";

import type { PermissionDefinition, PositionDefinition } from "@/lib/api";
import {
  useAttachPermissionToPosition,
  useDetachPermissionFromPosition,
  useModules,
  usePermissions,
  usePositionPermissions,
  useUpdatePositionDefinition,
} from "@/lib/api";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FormField,
  Select,
  Skeleton,
} from "@/components/ui";
import { Check, X } from "lucide-react";
import { useState } from "react";

import {
  describeEnablePermissionsError,
  describePositionPermissionError,
} from "../forms/position-mutation-errors";

/**
 * US-POS-03. "Qué puede hacer este cargo", in plain language: the
 * position's current permissions (GET /position-definitions/{id}/permissions)
 * listed by name, each removable, plus a picker for the ones it doesn't
 * have yet. Permission codes never reach the screen.
 *
 * E8: permissions of committee modules (e.g. "Votar en nombre del club" of
 * Reuniones) are in the same catalog, grouped by module, so the RDR assigns
 * them to positions like any other. The catalog is read from the
 * organization that owns the position (the district for its catalog).
 */
export function PositionPermissionsPanel({
  position,
  ownerName,
}: {
  position: PositionDefinition;
  /** Name of the organization that owns the position, when it has one. */
  ownerName?: string;
}) {
  const [permissionId, setPermissionId] = useState("");
  const scopeOrganizationId = position.ownerOrganizationId ?? undefined;
  const catalog = usePermissions(scopeOrganizationId);
  const modules = useModules(scopeOrganizationId);
  const current = usePositionPermissions(position.id);
  const attach = useAttachPermissionToPosition();
  const detach = useDetachPermissionFromPosition();
  const enable = useUpdatePositionDefinition();

  if (!position.defaultRoleCode) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Qué puede hacer este cargo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Alert
              tone="info"
              title="Este cargo es solo informativo."
              description="Quien lo ocupa figura como autoridad, pero el cargo no le da permisos adicionales en la plataforma."
            />
            {position.ownerOrganizationId ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Si querés que este cargo habilite acciones (por ejemplo,
                  gestionar un módulo del distrito), activá sus permisos.
                  Quienes ya lo ocupan los reciben automáticamente.
                </p>
                <Button
                  type="button"
                  disabled={enable.isPending}
                  onClick={() =>
                    enable.mutate({
                      positionDefinitionId: position.id,
                      payload: { grantsPermissions: true },
                    })
                  }
                >
                  {enable.isPending
                    ? "Activando…"
                    : "Activar permisos para este cargo"}
                </Button>
                {enable.isError ? (
                  <Alert
                    tone="danger"
                    title={describeEnablePermissionsError(enable.error).title}
                    description={
                      describeEnablePermissionsError(enable.error).description
                    }
                  />
                ) : null}
              </>
            ) : null}
          </div>
        </CardContent>
      </Card>
    );
  }

  const moduleName = (moduleId: string | null | undefined) =>
    moduleId
      ? (modules.data?.find((module) => module.id === moduleId)?.name ??
        moduleId)
      : undefined;
  const currentIds = new Set((current.data ?? []).map((p) => p.id));
  const available = (catalog.data ?? []).filter((p) => !currentIds.has(p.id));
  const groups = groupByModule(available, moduleName);
  const error = attach.isError
    ? attach.error
    : detach.isError
      ? detach.error
      : null;
  const reach =
    position.organizationType === "CLUB" && !ownerName?.trim()
      ? "a quienes ocupen este cargo en cualquier club"
      : position.organizationType === "CLUB"
        ? `a quienes ocupen este cargo en los clubes que usan el catálogo de ${ownerName}`
        : "a quienes ocupen este cargo";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Qué puede hacer este cargo</CardTitle>
        <CardDescription>
          Los cambios se aplican {reach}, desde su próximo ingreso. Los permisos
          de un módulo valen solo donde el módulo está activo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {current.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        ) : (current.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no tiene permisos asignados.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {(current.data ?? []).map((permission) => (
              <li
                key={permission.id}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <span className="flex flex-wrap items-center gap-2 text-sm">
                  <Check className="size-4 text-success" aria-hidden />
                  {permission.name}
                  {permission.moduleId ? (
                    <Badge tone="info">
                      Módulo {moduleName(permission.moduleId)}
                    </Badge>
                  ) : null}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={detach.isPending}
                  aria-label={`Quitar "${permission.name}"`}
                  onClick={() =>
                    detach.mutate({
                      positionDefinitionId: position.id,
                      permissionId: permission.id,
                    })
                  }
                >
                  <X className="size-3.5" aria-hidden />
                  Quitar
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <FormField
            label="Agregar un permiso"
            htmlFor="permissionId"
            className="flex-1"
          >
            <Select
              id="permissionId"
              value={permissionId}
              onChange={(event) => setPermissionId(event.target.value)}
            >
              <option value="">Elegí qué más puede hacer…</option>
              {groups.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.permissions.map((permission) => (
                    <option key={permission.id} value={permission.id}>
                      {permission.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </FormField>
          <Button
            type="button"
            disabled={!permissionId || attach.isPending}
            onClick={() =>
              attach.mutate(
                { positionDefinitionId: position.id, permissionId },
                { onSuccess: () => setPermissionId("") },
              )
            }
          >
            {attach.isPending ? "Agregando…" : "Agregar"}
          </Button>
        </div>

        {error ? (
          <Alert tone="danger" {...describePositionPermissionError(error)} />
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Mi Rotaract's own permissions first, then one group per module. */
export function groupByModule(
  permissions: PermissionDefinition[],
  moduleName: (moduleId: string | null | undefined) => string | undefined,
): Array<{ label: string; permissions: PermissionDefinition[] }> {
  const byName = (a: PermissionDefinition, b: PermissionDefinition) =>
    a.name.localeCompare(b.name, "es");
  const own = permissions.filter((p) => !p.moduleId).sort(byName);
  const moduleIds = [
    ...new Set(
      permissions.map((p) => p.moduleId).filter((id): id is string => !!id),
    ),
  ].sort((a, b) =>
    (moduleName(a) ?? a).localeCompare(moduleName(b) ?? b, "es"),
  );
  return [
    ...(own.length ? [{ label: "Mi Rotaract", permissions: own }] : []),
    ...moduleIds.map((moduleId) => ({
      label: `Módulo ${moduleName(moduleId)}`,
      permissions: permissions
        .filter((p) => p.moduleId === moduleId)
        .sort(byName),
    })),
  ];
}
