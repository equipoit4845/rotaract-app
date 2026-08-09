"use client";

import { MembershipsListContainer } from "@/features/memberships/containers/memberships-list-container";
import { DashboardShell } from "@/features/shell/dashboard-shell";

export default function MembershipsPage() {
  return (
    <DashboardShell activePath="/memberships">
      <MembershipsListContainer />
    </DashboardShell>
  );
}
