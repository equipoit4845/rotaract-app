"use client";

import { PeriodDetailContainer } from "@/features/periods/containers/period-detail-container";
import { DashboardShell } from "@/features/shell/dashboard-shell";
import { use } from "react";

export default function PeriodDetailPage({
  params,
}: {
  params: Promise<{ periodId: string }>;
}) {
  const { periodId } = use(params);

  return (
    <DashboardShell activePath="/periods">
      <PeriodDetailContainer periodId={periodId} />
    </DashboardShell>
  );
}
