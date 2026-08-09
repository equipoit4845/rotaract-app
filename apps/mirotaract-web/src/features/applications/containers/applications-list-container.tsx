"use client";

import { useCan, useMembershipApplications } from "@/lib/api";
import { DataState, DataToolbar, PageHeader } from "@equipoit4845/admin-shell";
import { Skeleton } from "@equipoit4845/ui";

import { useActiveOrganizationContext } from "@/features/shell/active-organization-context";
import { describeKernelError } from "@/features/shell/kernel-error-message";

import {
  ApplicationOrganizationFilter,
  ApplicationStatusFilter,
} from "../components/application-list-filters";
import { ApplicationsTable } from "../components/applications-table";
import { CreateApplicationDialog } from "../forms/create-application-dialog";
import { useApplicationListFilters } from "../view-models/use-application-list-filters";
import { useOrganizationCandidates } from "../view-models/use-organization-candidates";

/**
 * Organization scope resolution mirrors Memberships (docs/09-administrative-web.md
 * §6): an explicit `?organization=` wins outright; absent that,
 * `activeOrganizationId` is used as a default only — this never writes
 * the fallback back into the URL and never mutates the Shell's active
 * organization.
 *
 * Unlike Memberships, an unresolved `organizationId` is NOT a blocking
 * empty state here: `listMembershipApplications` doesn't require it
 * (`organizationId` is an optional query param in kernel-openapi.yaml,
 * not part of the URL path the way `listOrganizationMemberships` is) — an
 * actor without any active organization can still see their own
 * applications (`kernel.application.read.self` forces the result to their
 * own id regardless of the filter). Creating a new application still
 * needs a concrete target organization, so the create action only renders
 * once `organizationId` resolves to something.
 */
export function ApplicationsListContainer() {
  const {
    organizationId: urlOrganizationId,
    status,
    setOrganizationId,
    setStatus,
  } = useApplicationListFilters();
  const activeOrganization = useActiveOrganizationContext();
  const organizationId = urlOrganizationId ?? activeOrganization.organizationId;

  const query = useMembershipApplications({ organizationId, status });
  const { candidates: organizationCandidates } = useOrganizationCandidates();
  const canCreate = useCan("kernel.application.create.self", {
    scopeType: "ORGANIZATION",
    scopeId: organizationId,
  });

  const items = query.data ?? [];

  return (
    <>
      <PageHeader
        title="Solicitudes de membresía"
        description="Solicitudes de ingreso, con estado y revisión."
        actions={
          canCreate && organizationId ? (
            <CreateApplicationDialog organizationId={organizationId} />
          ) : undefined
        }
      />

      <DataToolbar
        filters={
          <div style={{ display: "flex", gap: "var(--mr-space-2)" }}>
            <ApplicationOrganizationFilter
              value={organizationId}
              organizations={organizationCandidates}
              onChange={setOrganizationId}
            />
            <ApplicationStatusFilter value={status} onChange={setStatus} />
          </div>
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
      ) : items.length === 0 ? (
        <DataState
          kind="empty"
          title="Sin solicitudes"
          description="No encontramos solicitudes de membresía con estos filtros."
        />
      ) : (
        <ApplicationsTable items={items} />
      )}
    </>
  );
}
