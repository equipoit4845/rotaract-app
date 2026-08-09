"use client";

import { PersonsListContainer } from "@/features/persons/containers/persons-list-container";
import { DashboardShell } from "@/features/shell/dashboard-shell";

export default function PersonsPage() {
  return (
    <DashboardShell activePath="/persons">
      <PersonsListContainer />
    </DashboardShell>
  );
}
