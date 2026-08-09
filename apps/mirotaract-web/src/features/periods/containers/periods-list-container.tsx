"use client";

import { useCan } from "@/lib/api";
import { DataState, DataToolbar, PageHeader } from "@equipoit4845/admin-shell";
import { Skeleton } from "@equipoit4845/ui";

import { useActiveOrganizationContext } from "@/features/shell/active-organization-context";
import { describeKernelError } from "@/features/shell/kernel-error-message";

import {
  PeriodOrganizationFilter,
  PeriodStatusFilter,
} from "../components/period-list-filters";
import { PeriodsTable } from "../components/periods-table";
import { CreatePeriodDialog } from "../forms/create-period-dialog";
import { useOrganizationCandidates } from "../view-models/use-organization-candidates";
import { usePeriodListFilters } from "../view-models/use-period-list-filters";
import { usePeriodListPage } from "../view-models/use-period-list-page";

/**
 * Organization scope resolution: an explicit `?organization=` wins
 * outright; absent that, `activeOrganizationId` is used as a default only
 * — this never writes the fallback back into the URL and never mutates
 * the Shell's active organization, so opening `/periods` with no query
 * param doesn't silently commit to a scope the URL doesn't say (same
 * split as Membresías' `MembershipsListContainer`, Fase 4).
 */
export function PeriodsListContainer() {
  const {
    organizationId: urlOrganizationId,
    status,
    setOrganizationId,
    setStatus,
  } = usePeriodListFilters();
  const activeOrganization = useActiveOrganizationContext();
  const organizationId = urlOrganizationId ?? activeOrganization.organizationId;

  const page = usePeriodListPage({ organizationId, status });
  const { candidates: organizationCandidates } = useOrganizationCandidates();
  const canCreate = useCan("kernel.period.create", {
    scopeType: "ORGANIZATION",
    scopeId: organizationId ?? "",
  });

  if (!organizationId) {
    return (
      <DataState
        kind="empty"
        title="Elegí una organización"
        description="Seleccioná una organización para ver sus períodos."
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Períodos"
        description="Períodos institucionales de la organización seleccionada."
        actions={
          canCreate ? (
            <CreatePeriodDialog organizationId={organizationId} />
          ) : undefined
        }
      />

      <DataToolbar
        filters={
          <div style={{ display: "flex", gap: "var(--mr-space-2)" }}>
            <PeriodOrganizationFilter
              value={organizationId}
              organizations={organizationCandidates}
              onChange={setOrganizationId}
            />
            <PeriodStatusFilter value={status} onChange={setStatus} />
          </div>
        }
      />

      {page.isLoading ? (
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
      ) : page.isError ? (
        <DataState kind="error" {...describeKernelError(page.error)} />
      ) : page.items.length === 0 ? (
        <DataState
          kind="empty"
          title="Sin períodos"
          description="No encontramos períodos con estos filtros."
        />
      ) : (
        <PeriodsTable items={page.items} />
      )}
    </>
  );
}
