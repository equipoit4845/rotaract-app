"use client";

import { KernelApiError, usePeriod } from "@/lib/api";
import { DataState, PageHeader } from "@equipoit4845/admin-shell";
import { Button, Skeleton } from "@equipoit4845/ui";
import Link from "next/link";

import { describeKernelError } from "@/features/shell/kernel-error-message";

import { PeriodActionsRow } from "../components/period-actions-row";
import { PeriodSummaryCard } from "../components/period-summary-card";

/**
 * `periodId` is the route's resource — this container never touches
 * `useActiveOrganization`/`useActiveOrganizationContext`, so opening a
 * detail page can't change the Shell's active organization (same
 * isolation as Organizations' `OrganizationDetailContainer`).
 */
export function PeriodDetailContainer({ periodId }: { periodId: string }) {
  const periodQuery = usePeriod(periodId);

  if (periodQuery.isLoading) {
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

  if (periodQuery.isError) {
    const error = periodQuery.error;
    if (error instanceof KernelApiError && error.isNotFound) {
      return (
        <DataState
          kind="empty"
          title="Período no encontrado"
          description="No encontramos el período que buscás. Puede haber sido cancelado o el enlace estar desactualizado."
        />
      );
    }
    return <DataState kind="error" {...describeKernelError(error)} />;
  }

  const period = periodQuery.data;
  if (!period) return null;

  return (
    <>
      <PageHeader
        title={period.name}
        description={period.code}
        breadcrumb={[
          { label: "Períodos", href: "/periods" },
          { label: period.name },
        ]}
        actions={<PeriodActionsRow period={period} />}
      />
      <PeriodSummaryCard period={period} />
      <div style={{ marginTop: "var(--mr-space-4)" }}>
        <Link
          href={`/appointments?period=${period.id}&organization=${period.organizationId}`}
        >
          <Button variant="secondary">Ver cargos de este período</Button>
        </Link>
      </div>
    </>
  );
}
