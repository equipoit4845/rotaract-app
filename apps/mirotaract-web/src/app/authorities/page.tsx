"use client";

import { AuthoritiesContainer } from "@/features/appointments/containers/authorities-container";
import { DashboardShell } from "@/features/shell/dashboard-shell";

export default function AuthoritiesPage() {
  return (
    <DashboardShell activePath="/authorities">
      <AuthoritiesContainer />
    </DashboardShell>
  );
}
