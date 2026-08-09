"use client";

import {
  useCurrentAuthorities,
  useCurrentPeriod,
  useOrganizationChildren,
  usePositionDefinitions,
} from "@/lib/api";
import type { Organization } from "@/lib/api";
import { PageHeader, StatCard } from "@equipoit4845/admin-shell";

import { AuthoritiesCard } from "../components/authorities-card";
import { ChildOrganizationsCard } from "../components/child-organizations-card";
import { PeriodSummaryCard } from "../components/period-summary-card";

/**
 * District-wide pending applications/transfers (aggregated across every
 * descendant club) are deliberately NOT shown here — `ApplicationFilters`/
 * `TransferFilters` only take one exact `organizationId`, not a tree, so
 * computing that would mean one request per club (the exact
 * `list clubs → GET applications per club` pattern the product spec bans,
 * §18). Documented as QUERY_PROJECTION_CANDIDATE in
 * docs/09-administrative-web.md — not silently dropped.
 */
export function DistrictDashboard({
  organization,
}: {
  organization: Organization;
}) {
  const period = useCurrentPeriod(organization.id);
  const children = useOrganizationChildren(organization.id);
  const authorities = useCurrentAuthorities(organization.id);
  const positions = usePositionDefinitions();

  const positionsById = new Map(
    (positions.data ?? []).map((position) => [position.id, position]),
  );

  return (
    <>
      <PageHeader
        title={organization.name}
        description={`Distrito · ${organization.code}`}
      />

      <div
        style={{
          display: "grid",
          gap: "var(--mr-space-4)",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        }}
      >
        <StatCard
          label="Clubes"
          value={children.data?.length ?? "—"}
          tone="success"
        />
        <StatCard
          label="Autoridades distritales"
          value={authorities.data?.length ?? "—"}
          tone="info"
        />
      </div>

      <div
        style={{
          display: "grid",
          gap: "var(--mr-space-4)",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          marginTop: "var(--mr-space-6)",
        }}
      >
        <ChildOrganizationsCard
          organizations={children.data}
          isLoading={children.isLoading}
          isError={children.isError}
          error={children.error}
        />
        <AuthoritiesCard
          title="Autoridades distritales vigentes"
          emptyDescription="Todavía no hay cargos distritales activos registrados."
          appointments={authorities.data}
          positionsById={positionsById}
          isLoading={authorities.isLoading || positions.isLoading}
          isError={authorities.isError}
          error={authorities.error}
        />
      </div>

      <div style={{ marginTop: "var(--mr-space-4)" }}>
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
