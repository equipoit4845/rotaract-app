"use client";

import { ApplicationDetailContainer } from "@/features/applications/containers/application-detail-container";
import { DashboardShell } from "@/features/shell/dashboard-shell";
import { use } from "react";

export default function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const { applicationId } = use(params);

  return (
    <DashboardShell activePath="/applications">
      <ApplicationDetailContainer applicationId={applicationId} />
    </DashboardShell>
  );
}
