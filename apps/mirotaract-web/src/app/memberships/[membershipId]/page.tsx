"use client";

import { MembershipDetailContainer } from "@/features/memberships/containers/membership-detail-container";
import { DashboardShell } from "@/features/shell/dashboard-shell";
import { use } from "react";

export default function MembershipDetailPage({
  params,
}: {
  params: Promise<{ membershipId: string }>;
}) {
  const { membershipId } = use(params);

  return (
    <DashboardShell activePath="/memberships">
      <MembershipDetailContainer membershipId={membershipId} />
    </DashboardShell>
  );
}
