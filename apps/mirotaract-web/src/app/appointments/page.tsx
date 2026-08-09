"use client";

import { AppointmentsListContainer } from "@/features/appointments/containers/appointments-list-container";
import { DashboardShell } from "@/features/shell/dashboard-shell";

export default function AppointmentsPage() {
  return (
    <DashboardShell activePath="/appointments">
      <AppointmentsListContainer />
    </DashboardShell>
  );
}
