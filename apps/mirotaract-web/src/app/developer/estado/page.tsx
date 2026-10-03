"use client";

import { StatusAdminContainer } from "@/features/status/containers/status-admin-container";
import { DashboardShell } from "@/features/shell/dashboard-shell";

/** E12.1 — incidents and maintenances (docs/19-operations-e12.md). */
export default function StatusAdminPage() {
  return (
    <DashboardShell activePath="/developer/estado">
      <StatusAdminContainer />
    </DashboardShell>
  );
}
