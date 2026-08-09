"use client";

import { TransferDetailContainer } from "@/features/transfers/containers/transfer-detail-container";
import { DashboardShell } from "@/features/shell/dashboard-shell";
import { use } from "react";

export default function TransferDetailPage({
  params,
}: {
  params: Promise<{ transferId: string }>;
}) {
  const { transferId } = use(params);

  return (
    <DashboardShell activePath="/transfers">
      <TransferDetailContainer transferId={transferId} />
    </DashboardShell>
  );
}
