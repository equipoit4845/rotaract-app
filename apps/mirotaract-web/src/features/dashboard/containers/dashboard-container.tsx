"use client";

import { useActiveOrganizationContext } from "@/features/shell/active-organization-context";
import { DataState } from "@equipoit4845/admin-shell";

import { ClubDashboard } from "./club-dashboard";
import { DistrictDashboard } from "./district-dashboard";

/**
 * `DashboardShell` already resolved `organization` before mounting any
 * page content (see the empty state in dashboard-shell.tsx) — reading it
 * again here is the same cached hook call via context, not a second
 * fetch and not a second `activeOrganizationId` selection.
 */
export function DashboardContainer() {
  const { organization } = useActiveOrganizationContext();

  if (!organization) {
    // Shouldn't happen — DashboardShell only renders children once
    // `organization` resolves — but a container shouldn't assume its
    // caller's invariant holds forever.
    return <DataState kind="empty" title="Elegí una organización" />;
  }

  if (organization.type === "DISTRICT") {
    return <DistrictDashboard organization={organization} />;
  }

  if (organization.type === "CLUB") {
    return <ClubDashboard organization={organization} />;
  }

  // OTHER: not one of the two dashboard scopes the product spec defines
  // (§17) — show what we know without guessing a layout for it.
  return (
    <DataState
      kind="empty"
      title={organization.name}
      description="Este tipo de organización todavía no tiene un panel dedicado."
    />
  );
}
