"use client";

import { useCan, usePositionDefinitions } from "@/lib/api";
import { DataState, DataToolbar, PageHeader } from "@equipoit4845/admin-shell";
import { Select, Skeleton } from "@equipoit4845/ui";
import Link from "next/link";

import { useActiveOrganizationContext } from "@/features/shell/active-organization-context";
import { describeKernelError } from "@/features/shell/kernel-error-message";

import { PositionsTable } from "../components/positions-table";
import { usePositionListFilters } from "../view-models/use-position-list-filters";

/**
 * US-POS-01 — the district catalog + system positions, listed with an
 * optional `organizationType` filter. `usePositionDefinitions` returns a
 * plain array (no cursor in `kernel-openapi.yaml`'s
 * `listPositionDefinitions` — `PositionDefinition[]`, not a `*Page`), so
 * there is no pagination view-model here, unlike Organizations/Memberships.
 *
 * "Crear cargo" is gated on `kernel.position.create` scoped to the active
 * organization's tree (creation targets a DISTRICT owner, invariant 6.6.1)
 * — a UX-only gate; the Kernel is the final authority either way.
 */
export function PositionsListContainer() {
  const { organizationType, setOrganizationType } = usePositionListFilters();
  const query = usePositionDefinitions(organizationType);
  const activeOrganization = useActiveOrganizationContext();
  const canCreate = useCan("kernel.position.create", {
    scopeType: "ORGANIZATION_TREE",
    scopeId: activeOrganization.organizationId,
  });

  return (
    <>
      <PageHeader
        title="Catálogo de cargos"
        description="Cargos configurables y de sistema disponibles para nominar autoridades."
        actions={
          canCreate ? <Link href="/positions/new">Crear cargo</Link> : undefined
        }
      />

      <DataToolbar
        filters={
          <Select
            aria-label="Filtrar por alcance"
            value={organizationType ?? ""}
            onChange={(event) =>
              setOrganizationType(
                (event.target.value || undefined) as
                  "DISTRICT" | "CLUB" | "OTHER" | undefined,
              )
            }
          >
            <option value="">Todos los alcances</option>
            <option value="DISTRICT">Distrito</option>
            <option value="CLUB">Club</option>
            <option value="OTHER">Otra</option>
          </Select>
        }
      />

      {query.isLoading ? (
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
      ) : query.isError ? (
        <DataState kind="error" {...describeKernelError(query.error)} />
      ) : !query.data || query.data.length === 0 ? (
        <DataState
          kind="empty"
          title="Sin cargos"
          description="No encontramos cargos con estos filtros."
        />
      ) : (
        <PositionsTable items={query.data} />
      )}
    </>
  );
}
