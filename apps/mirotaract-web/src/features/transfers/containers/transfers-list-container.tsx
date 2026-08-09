"use client";

import { useCan, useMembershipTransfers } from "@/lib/api";
import { DataState, DataToolbar, PageHeader } from "@equipoit4845/admin-shell";
import { Skeleton } from "@equipoit4845/ui";

import { describeKernelError } from "@/features/shell/kernel-error-message";

import {
  TransferOrganizationFilter,
  TransferStatusFilter,
} from "../components/transfer-list-filters";
import { TransfersTable } from "../components/transfers-table";
import { RequestTransferDialog } from "../forms/request-transfer-dialog";
import { useTransferListFilters } from "../view-models/use-transfer-list-filters";
import { useTransferOrganizationCandidates } from "../view-models/use-organization-candidates";

/**
 * `GET /membership-transfers` returns a plain `MembershipTransfer[]`, no
 * `pageInfo` (kernel-openapi.yaml) — this container has no
 * "which organization is this scoped to" default-fallback story like
 * `MembershipsListContainer` (US-MEM-01): `from`/`to`/`status`/`membership`
 * are all optional, independent URL filters, never defaulted from
 * `activeOrganizationId`. Requesting a transfer only needs
 * `kernel.transfer.create.self` (a `.self` permission, never
 * organization-scoped — see `RequestTransferDialog`).
 */
export function TransfersListContainer() {
  const {
    membershipId,
    fromOrganizationId,
    toOrganizationId,
    status,
    setFromOrganizationId,
    setToOrganizationId,
    setStatus,
  } = useTransferListFilters();

  const transfersQuery = useMembershipTransfers({
    membershipId,
    fromOrganizationId,
    toOrganizationId,
    status,
  });
  const { candidates: organizationCandidates } =
    useTransferOrganizationCandidates();
  const canRequest = useCan("kernel.transfer.create.self");

  return (
    <>
      <PageHeader
        title="Transferencias"
        description="Transferencias de membresía entre organizaciones."
        actions={canRequest ? <RequestTransferDialog /> : undefined}
      />

      <DataToolbar
        filters={
          <div style={{ display: "flex", gap: "var(--mr-space-2)" }}>
            <TransferOrganizationFilter
              value={fromOrganizationId}
              organizations={organizationCandidates}
              onChange={setFromOrganizationId}
              ariaLabel="Filtrar por organización de origen"
              placeholder="Origen: todas"
            />
            <TransferOrganizationFilter
              value={toOrganizationId}
              organizations={organizationCandidates}
              onChange={setToOrganizationId}
              ariaLabel="Filtrar por organización de destino"
              placeholder="Destino: todas"
            />
            <TransferStatusFilter value={status} onChange={setStatus} />
          </div>
        }
      />

      {transfersQuery.isLoading ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--mr-space-2)",
            marginTop: "var(--mr-space-4)",
          }}
        >
          <Skeleton style={{ height: "2.5rem" }} />
          <Skeleton style={{ height: "2.5rem" }} />
          <Skeleton style={{ height: "2.5rem" }} />
        </div>
      ) : transfersQuery.isError ? (
        <DataState
          kind="error"
          {...describeKernelError(transfersQuery.error)}
        />
      ) : (transfersQuery.data ?? []).length === 0 ? (
        <DataState
          kind="empty"
          title="Sin transferencias"
          description="No encontramos transferencias con estos filtros."
        />
      ) : (
        <TransfersTable items={transfersQuery.data ?? []} />
      )}
    </>
  );
}
