"use client";

import { MyAppsContainer } from "@/features/governance/containers/my-apps-container";
import { DashboardShell } from "@/features/shell/dashboard-shell";

export default function MyAppsPage() {
  return (
    <DashboardShell activePath="/apps" allowWithoutOrganization>
      <MyAppsContainer />
    </DashboardShell>
  );
}
