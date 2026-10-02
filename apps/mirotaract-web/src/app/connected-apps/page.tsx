"use client";

import { ConnectedAppsContainer } from "@/features/oauth/containers/connected-apps-container";
import { DashboardShell } from "@/features/shell/dashboard-shell";

export default function ConnectedAppsPage() {
  return (
    <DashboardShell activePath="/connected-apps" allowWithoutOrganization>
      <ConnectedAppsContainer />
    </DashboardShell>
  );
}
