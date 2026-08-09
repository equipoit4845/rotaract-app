"use client";

import { OrganizationEditContainer } from "@/features/organizations/containers/organization-edit-container";
import { DashboardShell } from "@/features/shell/dashboard-shell";
import { use } from "react";

export default function OrganizationEditPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = use(params);

  return (
    <DashboardShell activePath="/organizations">
      <OrganizationEditContainer organizationId={organizationId} />
    </DashboardShell>
  );
}
