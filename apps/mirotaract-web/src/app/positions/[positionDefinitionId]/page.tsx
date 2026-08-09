"use client";

import { PositionDetailContainer } from "@/features/positions/containers/position-detail-container";
import { DashboardShell } from "@/features/shell/dashboard-shell";
import { use } from "react";

export default function PositionDetailPage({
  params,
}: {
  params: Promise<{ positionDefinitionId: string }>;
}) {
  const { positionDefinitionId } = use(params);

  return (
    <DashboardShell activePath="/positions">
      <PositionDetailContainer positionDefinitionId={positionDefinitionId} />
    </DashboardShell>
  );
}
