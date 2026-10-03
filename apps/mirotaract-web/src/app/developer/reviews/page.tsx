"use client";

import { ReviewQueueContainer } from "@/features/governance/containers/review-queue-container";
import { DashboardShell } from "@/features/shell/dashboard-shell";

export default function DeveloperReviewsPage() {
  return (
    <DashboardShell activePath="/developer/reviews">
      <ReviewQueueContainer />
    </DashboardShell>
  );
}
