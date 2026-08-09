"use client";

import { AppointmentDetailContainer } from "@/features/appointments/containers/appointment-detail-container";
import { DashboardShell } from "@/features/shell/dashboard-shell";
import { use } from "react";

export default function AppointmentDetailPage({
  params,
}: {
  params: Promise<{ appointmentId: string }>;
}) {
  const { appointmentId } = use(params);

  return (
    <DashboardShell activePath="/appointments">
      <AppointmentDetailContainer appointmentId={appointmentId} />
    </DashboardShell>
  );
}
