"use client";

import { DataState } from "@equipoit4845/admin-shell";

/**
 * Socios/Autoridades/Períodos aren't in scope for this phase (product
 * spec §12/§41) — no route exists yet to link to, and no
 * Membership/Appointment/Period hook is called just to fill a pending
 * tab. This placeholder makes that explicit instead of silently faking
 * a working section.
 */
export function OrganizationFutureTab({
  description,
}: {
  description: string;
}) {
  return (
    <DataState
      kind="empty"
      title="Disponible en una fase futura"
      description={description}
    />
  );
}
