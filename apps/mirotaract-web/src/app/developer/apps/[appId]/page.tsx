"use client";

import { DeveloperAppDetailContainer } from "@/features/developer-apps/containers/developer-app-detail-container";
import { DashboardShell } from "@/features/shell/dashboard-shell";
import { use } from "react";

export default function DeveloperAppDetailPage({
  params,
}: {
  params: Promise<{ appId: string }>;
}) {
  const { appId } = use(params);

  return (
    <DashboardShell activePath="/developer/apps">
      <DeveloperAppDetailContainer appId={appId} />
    </DashboardShell>
  );
}
