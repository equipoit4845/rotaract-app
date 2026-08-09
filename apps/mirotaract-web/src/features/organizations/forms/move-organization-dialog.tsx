"use client";

import type { Organization } from "@/lib/api";
import { useCan, useMoveOrganization, useOrganization } from "@/lib/api";
import { Button, FormField, Select } from "@equipoit4845/ui";
import { useState } from "react";

import { canMoveOrganization } from "../adapters/organization-lifecycle";
import { ConfirmationDialog } from "../components/confirmation-dialog";
import { describeMoveOrganizationError } from "./organization-mutation-errors";
import { useParentCandidates } from "./use-parent-candidates";

/**
 * The most sensitive action in this phase (product spec §27). The Kernel
 * validates cycles, scope, and parent-type compatibility (invariant
 * 6.3.6) — this dialog only offers a bounded, obviously-compatible
 * candidate list and surfaces the Kernel's own 409 for a real cycle.
 */
export function MoveOrganizationDialog({
  organization,
}: {
  organization: Organization;
}) {
  const [open, setOpen] = useState(false);
  const [newParentId, setNewParentId] = useState("");
  const move = useMoveOrganization();
  const canMove = useCan("kernel.organization.move", {
    scopeType: "ORGANIZATION",
    scopeId: organization.id,
  });
  const { data: currentParent } = useOrganization(
    organization.parentId ?? undefined,
  );
  const { candidates } = useParentCandidates(
    organization.type === "CLUB" ? "DISTRICT" : undefined,
  );

  if (!canMove || !canMoveOrganization(organization.status)) return null;

  const candidateOptions = candidates.filter((c) => c.id !== organization.id);

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          move.reset();
          setNewParentId("");
        }
      }}
      trigger={<Button variant="outline">Mover</Button>}
      title="Mover organización"
      description={`Cambiá la organización padre de "${organization.name}" en la jerarquía institucional.`}
      confirmLabel="Mover"
      isPending={move.isPending}
      errorMessage={
        move.isError ? describeMoveOrganizationError(move.error) : undefined
      }
      onConfirm={() =>
        move.mutate(
          { organizationId: organization.id, newParentId: newParentId || null },
          { onSuccess: () => setOpen(false) },
        )
      }
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--mr-space-3)",
        }}
      >
        <p style={{ margin: 0 }}>
          <strong>Organización actual:</strong> {organization.name}
        </p>
        <p style={{ margin: 0 }}>
          <strong>Padre actual:</strong>{" "}
          {organization.parentId ? (currentParent?.name ?? "…") : "Sin padre"}
        </p>
        <FormField label="Nuevo padre" htmlFor="newParentId">
          <Select
            id="newParentId"
            value={newParentId}
            onChange={(event) => setNewParentId(event.target.value)}
          >
            <option value="">Sin organización padre</option>
            {candidateOptions.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
    </ConfirmationDialog>
  );
}
