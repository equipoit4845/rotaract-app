"use client";

import { useCan } from "@/lib/api";
import {
  DataPagination,
  DataState,
  DataToolbar,
  PageHeader,
} from "@equipoit4845/admin-shell";
import { Skeleton } from "@equipoit4845/ui";

import { describeKernelError } from "@/features/shell/kernel-error-message";

import { OrganizationListFilters as OrganizationListFiltersRow } from "../components/organization-list-filters";
import { OrganizationSearchInput } from "../components/organization-search-input";
import { OrganizationsTable } from "../components/organizations-table";
import { useOrganizationListFilters } from "../view-models/use-organization-list-filters";
import { useOrganizationListPage } from "../view-models/use-organization-list-page";
import { CreateOrganizationDialog } from "../forms/create-organization-dialog";

export function OrganizationsListContainer() {
  const { filters, setType, setStatus, setQuery } =
    useOrganizationListFilters();
  const page = useOrganizationListPage(filters);
  const canCreate = useCan("kernel.organization.create");

  return (
    <>
      <PageHeader
        title="Organizaciones"
        description="Distritos, clubes y otras organizaciones institucionales."
        actions={canCreate ? <CreateOrganizationDialog /> : undefined}
      />

      <DataToolbar
        search={
          <OrganizationSearchInput value={filters.query} onCommit={setQuery} />
        }
        filters={
          <OrganizationListFiltersRow
            type={filters.type}
            status={filters.status}
            onTypeChange={setType}
            onStatusChange={setStatus}
          />
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
          title="Sin organizaciones"
          description="No encontramos organizaciones con estos filtros."
        />
      ) : (
        <>
          <OrganizationsTable items={page.items} />
          <DataPagination
            summary={`${page.items.length} organización(es) en esta página`}
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
