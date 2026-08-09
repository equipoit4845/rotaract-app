"use client";

import { PositionsListContainer } from "@/features/positions/containers/positions-list-container";
import { DashboardShell } from "@/features/shell/dashboard-shell";

export default function PositionsPage() {
  return (
    <DashboardShell activePath="/positions">
      <PositionsListContainer />
    </DashboardShell>
  );
}
