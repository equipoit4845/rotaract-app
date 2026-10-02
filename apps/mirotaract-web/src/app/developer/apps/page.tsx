"use client";

import { DeveloperAppsListContainer } from "@/features/developer-apps/containers/developer-apps-list-container";
import { DashboardShell } from "@/features/shell/dashboard-shell";

export default function DeveloperAppsPage() {
  return (
    <DashboardShell activePath="/developer/apps">
      <DeveloperAppsListContainer />
    </DashboardShell>
  );
}
