"use client";

import { ModulesContainer } from "@/features/modules/containers/modules-container";
import { DashboardShell } from "@/features/shell/dashboard-shell";

export default function ModulesPage() {
  return (
    <DashboardShell activePath="/modules">
      <ModulesContainer />
    </DashboardShell>
  );
}
