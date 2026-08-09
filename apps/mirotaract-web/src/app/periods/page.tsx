"use client";

import { PeriodsListContainer } from "@/features/periods/containers/periods-list-container";
import { DashboardShell } from "@/features/shell/dashboard-shell";

export default function PeriodsPage() {
  return (
    <DashboardShell activePath="/periods">
      <PeriodsListContainer />
    </DashboardShell>
  );
}
