"use client";

import type { Organization } from "@/lib/api";
import { useCan } from "@/lib/api";
import { Button } from "@equipoit4845/ui";
import Link from "next/link";

import { canEditOrganization } from "../adapters/organization-lifecycle";
import { ActivateOrganizationDialog } from "../forms/activate-organization-dialog";
import { ArchiveOrganizationDialog } from "../forms/archive-organization-dialog";
import { DeactivateOrganizationDialog } from "../forms/deactivate-organization-dialog";
import { MoveOrganizationDialog } from "../forms/move-organization-dialog";

/**
 * Each action gates itself on `useCan()` + the real state machine and
 * renders nothing when not applicable — this row never hardcodes which
 * actions exist, it just lays out whatever the child components decide
 * to render (product spec §30).
 */
export function OrganizationActionsRow({
  organization,
}: {
  organization: Organization;
}) {
  const canEdit = useCan("kernel.organization.update", {
    scopeType: "ORGANIZATION",
    scopeId: organization.id,
  });

  return (
    <div
      style={{ display: "flex", gap: "var(--mr-space-2)", flexWrap: "wrap" }}
    >
      {canEdit && canEditOrganization(organization.status) ? (
        <Link href={`/organizations/${organization.id}/edit`}>
          <Button variant="secondary">Editar</Button>
        </Link>
      ) : null}
      <ActivateOrganizationDialog organization={organization} />
      <DeactivateOrganizationDialog organization={organization} />
      <MoveOrganizationDialog organization={organization} />
      <ArchiveOrganizationDialog organization={organization} />
    </div>
  );
}
