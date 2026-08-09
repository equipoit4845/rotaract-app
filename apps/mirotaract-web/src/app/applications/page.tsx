"use client";

import { ApplicationsListContainer } from "@/features/applications/containers/applications-list-container";
import { DashboardShell } from "@/features/shell/dashboard-shell";

export default function ApplicationsPage() {
  return (
    <DashboardShell activePath="/applications">
      <ApplicationsListContainer />
    </DashboardShell>
  );
}
