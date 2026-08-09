"use client";

import { TransfersListContainer } from "@/features/transfers/containers/transfers-list-container";
import { DashboardShell } from "@/features/shell/dashboard-shell";

export default function TransfersPage() {
  return (
    <DashboardShell activePath="/transfers">
      <TransfersListContainer />
    </DashboardShell>
  );
}
