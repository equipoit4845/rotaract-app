"use client";

import {
  useCurrentAuthorities,
  useCurrentPeriod,
  useMembershipApplications,
  useMembershipTransfers,
  useOrganizationMemberships,
  usePositionDefinitions,
} from "@/lib/api";
import type { Organization } from "@/lib/api";
import { PageHeader, StatCard } from "@equipoit4845/admin-shell";

import { AuthoritiesCard } from "../components/authorities-card";
import { PeriodSummaryCard } from "../components/period-summary-card";

/**
 * Membership count is bounded, not exact: one request with `limit: 100` —
 * if `pageInfo.hasMore` is true this shows "100+" instead of paging through
 * every member to fabricate an exact total (`MembershipPage` has no
 * `total` field to read one from). See docs/09-administrative-web.md,
 * QUERY_PROJECTION_CANDIDATE.
 *
 * `useOrganizationMemberships` is a real cursor `useInfiniteQuery` (Fase 4
 * — see docs/09-administrative-web.md, Área 3) — this reads only the first
 * page, never calls `fetchNextPage`, which is exactly the bounded single
 * request this stat card wants.
 */
function formatMembershipCount(
  memberships: ReturnType<typeof useOrganizationMemberships>,
): string {
  const firstPage = memberships.data?.pages[0];
  if (!firstPage) return "—";
  const count = firstPage.items?.length ?? 0;
  return firstPage.pageInfo?.hasMore ? `${count}+` : String(count);
}

export function ClubDashboard({
  organization,
}: {
  organization: Organization;
}) {
  const period = useCurrentPeriod(organization.id);
  const memberships = useOrganizationMemberships(organization.id, {
    status: ["ACTIVE"],
    limit: 100,
  });
  const authorities = useCurrentAuthorities(organization.id);
  const positions = usePositionDefinitions();
  const pendingApplications = useMembershipApplications({
    organizationId: organization.id,
    status: "SUBMITTED",
  });
  // Two bounded requests (origin, destination), not one per transfer — a
  // transfer can't have the same org on both sides (invariant 6.9.2), so
  // the two result sets never overlap and can just be summed.
  const requestedTransfersFrom = useMembershipTransfers({
    fromOrganizationId: organization.id,
    status: "REQUESTED",
  });
  const requestedTransfersTo = useMembershipTransfers({
    toOrganizationId: organization.id,
    status: "REQUESTED",
  });

  const positionsById = new Map(
    (positions.data ?? []).map((position) => [position.id, position]),
  );
  const requestedTransfersCount =
    requestedTransfersFrom.data && requestedTransfersTo.data
      ? requestedTransfersFrom.data.length + requestedTransfersTo.data.length
      : undefined;

  return (
    <>
      <PageHeader
        title={organization.name}
        description={`Club · ${organization.code}`}
      />

      <div
        style={{
          display: "grid",
          gap: "var(--mr-space-4)",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        }}
      >
        <StatCard
          label="Membresías activas"
          value={formatMembershipCount(memberships)}
          tone="success"
        />
        <StatCard
          label="Autoridades vigentes"
          value={authorities.data?.length ?? "—"}
          tone="info"
        />
        <StatCard
          label="Solicitudes pendientes"
          value={pendingApplications.data?.length ?? "—"}
          tone="warning"
        />
        <StatCard
          label="Transferencias solicitadas"
          value={requestedTransfersCount ?? "—"}
          tone="neutral"
        />
      </div>

      <div
        style={{
          display: "grid",
          gap: "var(--mr-space-4)",
          gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)",
          marginTop: "var(--mr-space-6)",
        }}
      >
        <AuthoritiesCard
          title="Autoridades vigentes"
          emptyDescription="Todavía no hay cargos activos registrados en este club."
          appointments={authorities.data}
          positionsById={positionsById}
          isLoading={authorities.isLoading || positions.isLoading}
          isError={authorities.isError}
          error={authorities.error}
        />
        <PeriodSummaryCard
          period={period.data}
          isLoading={period.isLoading}
          isError={period.isError}
          error={period.error}
        />
      </div>
    </>
  );
}
