"use client";

import {
  useCan,
  useCurrentAuthorities,
  usePositionDefinitions,
} from "@/lib/api";
import { DataState, DataToolbar, PageHeader } from "@equipoit4845/admin-shell";
import { Skeleton } from "@equipoit4845/ui";
import Link from "next/link";

import { useActiveOrganizationContext } from "@/features/shell/active-organization-context";
import { describeKernelError } from "@/features/shell/kernel-error-message";

import { AuthoritiesTable } from "../components/authorities-table";
import { OrganizationScopeFilter } from "../components/organization-scope-filter";
import { useAuthoritiesFilters } from "../view-models/use-authorities-filters";
import { useOrganizationCandidates } from "../view-models/use-organization-candidates";

/**
 * US-APP-01 — dedicated view for `getCurrentAuthorities`
 * (`GET /organizations/{id}/authorities/current`, kernel-openapi.yaml
 * CA-APP-03/04): the ACTIVE appointments of the current period for an
 * organization. Already consumed for the Dashboard cards
 * (`features/dashboard/components/authorities-card.tsx`) — this is the
 * standalone, navigable, filterable version with its own URL.
 *
 * Organization scope resolution mirrors Memberships (product spec §6): an
 * explicit `?organization=` wins outright; absent that,
 * `activeOrganizationId` is used as a default only.
 */
export function AuthoritiesContainer() {
  const { organizationId: urlOrganizationId, setOrganizationId } =
    useAuthoritiesFilters();
  const activeOrganization = useActiveOrganizationContext();
  const organizationId = urlOrganizationId ?? activeOrganization.organizationId;

  const authorities = useCurrentAuthorities(organizationId);
  const positions = usePositionDefinitions();
  const { candidates: organizationCandidates } = useOrganizationCandidates();
  const canCreate = useCan("kernel.appointment.create", {
    scopeType: "ORGANIZATION",
    scopeId: organizationId,
  });

  const positionsById = new Map(
    (positions.data ?? []).map((position) => [position.id, position]),
  );

  if (!organizationId) {
    return (
      <DataState
        kind="empty"
        title="Elegí una organización"
        description="Seleccioná una organización para ver sus autoridades vigentes."
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Autoridades vigentes"
        description="Cargos ACTIVE del período vigente para la organización seleccionada."
        actions={
          canCreate ? (
            <Link href={`/appointments?organization=${organizationId}`}>
              Nominar cargo
            </Link>
          ) : undefined
        }
      />

      <DataToolbar
        filters={
          <OrganizationScopeFilter
            value={organizationId}
            organizations={organizationCandidates}
            onChange={setOrganizationId}
          />
        }
      />

      {authorities.isLoading || positions.isLoading ? (
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
        </div>
      ) : authorities.isError ? (
        <DataState kind="error" {...describeKernelError(authorities.error)} />
      ) : !authorities.data || authorities.data.length === 0 ? (
        <DataState
          kind="empty"
          title="Sin autoridades vigentes"
          description="Todavía no hay cargos activos registrados para esta organización."
        />
      ) : (
        <AuthoritiesTable
          appointments={authorities.data}
          positionsById={positionsById}
        />
      )}
    </>
  );
}
