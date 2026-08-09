"use client";

import type { PositionDefinition } from "@/lib/api";
import {
  useAttachPermissionToPosition,
  useDetachPermissionFromPosition,
  usePermissions,
} from "@/lib/api";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FormField,
  Select,
} from "@equipoit4845/ui";
import { useState } from "react";

import { describePositionPermissionError } from "../forms/position-mutation-errors";

/**
 * US-POS-03 (permisos). `kernel-openapi.yaml` only exposes
 * `PUT/DELETE /position-definitions/{id}/permissions/{permissionId}` —
 * there is no `GET` that returns a role's/position's *currently attached*
 * permissions (`RoleDefinition` carries no `permissions` field, and there
 * is no `/roles/{roleId}/permissions` list endpoint either). This panel can
 * therefore only fire attach/detach blind — it cannot render a
 * checked/unchecked state for each permission. Documented as `BLOCKED_API`
 * in docs/09-administrative-web.md under US-POS-03.
 */
export function PositionPermissionsPanel({
  position,
}: {
  position: PositionDefinition;
}) {
  const [permissionId, setPermissionId] = useState("");
  const permissions = usePermissions();
  const attach = useAttachPermissionToPosition();
  const detach = useDetachPermissionFromPosition();

  if (!position.defaultRoleCode) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Permisos</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert
            tone="info"
            title="Este cargo no tiene un rol técnico asociado."
            description="Asigná un rol técnico (defaultRoleCode) para poder gestionar sus permisos (CA-POS-02)."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Permisos del rol técnico</CardTitle>
      </CardHeader>
      <CardContent>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--mr-space-3)",
          }}
        >
          <FormField label="Permiso" htmlFor="permissionId">
            <Select
              id="permissionId"
              value={permissionId}
              onChange={(event) => setPermissionId(event.target.value)}
            >
              <option value="">Elegí un permiso</option>
              {(permissions.data ?? []).map((permission) => (
                <option key={permission.id} value={permission.id}>
                  {permission.code}
                </option>
              ))}
            </Select>
          </FormField>

          <div style={{ display: "flex", gap: "var(--mr-space-2)" }}>
            <Button
              type="button"
              disabled={!permissionId || attach.isPending}
              onClick={() =>
                attach.mutate({
                  positionDefinitionId: position.id,
                  permissionId,
                })
              }
            >
              {attach.isPending ? "Adjuntando…" : "Adjuntar"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!permissionId || detach.isPending}
              onClick={() =>
                detach.mutate({
                  positionDefinitionId: position.id,
                  permissionId,
                })
              }
            >
              {detach.isPending ? "Quitando…" : "Quitar"}
            </Button>
          </div>

          {attach.isError ? (
            <Alert
              tone="danger"
              title={describePositionPermissionError(attach.error).title}
              description={
                describePositionPermissionError(attach.error).description
              }
            />
          ) : null}
          {detach.isError ? (
            <Alert
              tone="danger"
              title={describePositionPermissionError(detach.error).title}
              description={
                describePositionPermissionError(detach.error).description
              }
            />
          ) : null}
          {attach.isSuccess ? (
            <Alert tone="success" title="Permiso adjuntado." />
          ) : null}
          {detach.isSuccess ? (
            <Alert tone="success" title="Permiso quitado." />
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
