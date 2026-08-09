"use client";

import { PersonDetailContainer } from "@/features/persons/containers/person-detail-container";
import { DashboardShell } from "@/features/shell/dashboard-shell";
import { use } from "react";

export default function PersonDetailPage({
  params,
}: {
  params: Promise<{ personId: string }>;
}) {
  const { personId } = use(params);

  return (
    <DashboardShell activePath="/persons">
      <PersonDetailContainer personId={personId} />
    </DashboardShell>
  );
}
