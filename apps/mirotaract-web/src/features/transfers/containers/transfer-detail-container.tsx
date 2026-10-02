"use client";

import { KernelApiError, useMembershipTransfer } from "@/lib/api";
import { DataState, EntityHero } from "@/components/layout";
import { StatusBadge } from "@/components/domain/status-badge";
import { Skeleton } from "@/components/ui";

import { describeKernelError } from "@/features/shell/kernel-error-message";

import { TransferActionsRow } from "../components/transfer-actions-row";
import { TransferSummaryCard } from "../components/transfer-summary-card";
import { TransferWorkflowTimeline } from "../components/transfer-workflow-timeline";

export function TransferDetailContainer({
  transferId,
}: {
  transferId: string;
}) {
  const transferQuery = useMembershipTransfer(transferId);
  const transfer = transferQuery.data;

  if (transferQuery.isLoading) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--mr-space-3)",
        }}
      >
        <Skeleton style={{ height: "2rem" }} />
        <Skeleton style={{ height: "12rem" }} />
      </div>
    );
  }

  if (transferQuery.isError) {
    const error = transferQuery.error;
    if (error instanceof KernelApiError && error.isNotFound) {
      return (
        <DataState
          kind="empty"
          title="Transferencia no encontrada"
          description="No encontramos la transferencia que buscás. Puede haber sido eliminada o el enlace estar desactualizado."
        />
      );
    }
    return <DataState kind="error" {...describeKernelError(error)} />;
  }

  if (!transfer) return null;

  return (
    <>
      <EntityHero
        badges={<StatusBadge kind="transfer" status={transfer.status} />}
        title="Transferencia de membresía"
        breadcrumb={[
          { label: "Transferencias", href: "/transfers" },
          { label: "Detalle" },
        ]}
        actions={<TransferActionsRow transfer={transfer} />}
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--mr-space-4)",
        }}
      >
        <TransferSummaryCard transfer={transfer} />
        <TransferWorkflowTimeline transfer={transfer} />
      </div>
    </>
  );
}
