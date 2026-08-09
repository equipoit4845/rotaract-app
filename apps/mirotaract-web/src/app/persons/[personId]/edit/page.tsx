"use client";

import { PersonEditContainer } from "@/features/persons/containers/person-edit-container";
import { DashboardShell } from "@/features/shell/dashboard-shell";
import { use } from "react";

export default function PersonEditPage({
  params,
}: {
  params: Promise<{ personId: string }>;
}) {
  const { personId } = use(params);

  return (
    <DashboardShell activePath="/persons">
      <PersonEditContainer personId={personId} />
    </DashboardShell>
  );
}
