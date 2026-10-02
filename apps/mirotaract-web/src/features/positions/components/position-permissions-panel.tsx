"use client";

import type { PositionDefinition } from "@/lib/api";
import {
  useAttachPermissionToPosition,
  useDetachPermissionFromPosition,
  usePermissions,
  usePositionPermissions,
} from "@/lib/api";
import {
  Alert,
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

import { describePositionPermissionError } from "../forms/position-mutation-errors";

/**
 * US-POS-03. "Qué puede hacer este cargo", in plain language: the
 * position's current permissions (GET /position-definitions/{id}/permissions)
 * listed by name, each removable, plus a picker for the ones it doesn't
 * have yet. Permission codes never reach the screen.
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
  const catalog = usePermissions();
  const current = usePositionPermissions(position.id);
  const attach = useAttachPermissionToPosition();
  const detach = useDetachPermissionFromPosition();

  if (!position.defaultRoleCode) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Qué puede hacer este cargo</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert
            tone="info"
            title="Este cargo es solo informativo."
            description="Quien lo ocupa figura como autoridad, pero el cargo no le da permisos adicionales en la plataforma."
          />
        </CardContent>
      </Card>
    );
  }

  const currentIds = new Set((current.data ?? []).map((p) => p.id));
  const available = (catalog.data ?? [])
    .filter((p) => !currentIds.has(p.id))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
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
          Los cambios se aplican {reach}, desde su próximo ingreso.
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
                <span className="flex items-center gap-2 text-sm">
                  <Check className="size-4 text-success" aria-hidden />
                  {permission.name}
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
              {available.map((permission) => (
                <option key={permission.id} value={permission.id}>
                  {permission.name}
                </option>
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
