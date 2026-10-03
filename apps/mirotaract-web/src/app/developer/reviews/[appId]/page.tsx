"use client";

import { ReviewDetailContainer } from "@/features/governance/containers/review-detail-container";
import { DashboardShell } from "@/features/shell/dashboard-shell";
import { use } from "react";

export default function DeveloperReviewDetailPage({
  params,
}: {
  params: Promise<{ appId: string }>;
}) {
  const { appId } = use(params);
  return (
    <DashboardShell activePath="/developer/reviews">
      <ReviewDetailContainer appId={appId} />
    </DashboardShell>
  );
}
