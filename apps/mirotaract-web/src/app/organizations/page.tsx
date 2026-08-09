"use client";

import { OrganizationsListContainer } from "@/features/organizations/containers/organizations-list-container";
import { DashboardShell } from "@/features/shell/dashboard-shell";

export default function OrganizationsPage() {
  return (
    <DashboardShell activePath="/organizations">
      <OrganizationsListContainer />
    </DashboardShell>
  );
}
