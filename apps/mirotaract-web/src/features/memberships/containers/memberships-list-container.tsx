"use client";

import { useCan } from "@/lib/api";
import {
  DataPagination,
  DataState,
  DataToolbar,
  PageHeader,
} from "@equipoit4845/admin-shell";
import { Skeleton } from "@equipoit4845/ui";

import { useActiveOrganizationContext } from "@/features/shell/active-organization-context";
import { describeKernelError } from "@/features/shell/kernel-error-message";

import {
  MembershipOrganizationFilter,
  MembershipStatusFilter,
} from "../components/membership-list-filters";
import { MembershipsTable } from "../components/memberships-table";
import { CreateMembershipDialog } from "../forms/create-membership-dialog";
import { useMembershipListFilters } from "../view-models/use-membership-list-filters";
import { useMembershipListPage } from "../view-models/use-membership-list-page";
import { useOrganizationCandidates } from "../view-models/use-organization-candidates";

/**
 * Organization scope resolution (product spec §6): an explicit
 * `?organization=` wins outright; absent that, `activeOrganizationId` is
 * used as a default only — this never writes the fallback back into the
 * URL and never mutates the Shell's active organization, so opening
 * `/memberships` with no query param doesn't silently commit to a scope
 * the URL doesn't say.
 */
export function MembershipsListContainer() {
  const {
    organizationId: urlOrganizationId,
    status,
    setOrganizationId,
    setStatus,
  } = useMembershipListFilters();
  const activeOrganization = useActiveOrganizationContext();
  const organizationId = urlOrganizationId ?? activeOrganization.organizationId;

  const page = useMembershipListPage({
    organizationId,
    status: status ? [status] : undefined,
  });
  const { candidates: organizationCandidates } = useOrganizationCandidates();
  const canCreate = useCan("kernel.membership.create", {
    scopeType: "ORGANIZATION",
    scopeId: organizationId,
  });

  if (!organizationId) {
    return (
      <DataState
        kind="empty"
        title="Elegí una organización"
        description="Seleccioná una organización para ver sus membresías."
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Membresías"
        description="Socios de la organización seleccionada."
        actions={
          canCreate ? (
            <CreateMembershipDialog organizationId={organizationId} />
          ) : undefined
        }
      />

      <DataToolbar
        filters={
          <div style={{ display: "flex", gap: "var(--mr-space-2)" }}>
            <MembershipOrganizationFilter
              value={organizationId}
              organizations={organizationCandidates}
              onChange={setOrganizationId}
            />
            <MembershipStatusFilter value={status} onChange={setStatus} />
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
          title="Sin membresías"
          description="No encontramos membresías con estos filtros."
        />
      ) : (
        <>
          <MembershipsTable items={page.items} />
          <DataPagination
            summary={`${page.items.length} membresía(s) en esta página`}
            hasPrevious={page.hasPrevious}
            hasNext={page.hasNext}
            onPrevious={page.goPrevious}
            onNext={page.goNext}
          />
        </>
      )}
    </>
  );
}
