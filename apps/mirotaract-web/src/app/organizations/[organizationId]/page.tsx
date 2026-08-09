"use client";

import { OrganizationDetailContainer } from "@/features/organizations/containers/organization-detail-container";
import { DashboardShell } from "@/features/shell/dashboard-shell";
import { use } from "react";

export default function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = use(params);

  return (
    <DashboardShell activePath="/organizations">
      <OrganizationDetailContainer organizationId={organizationId} />
    </DashboardShell>
  );
}
