"use client";

import { useCan } from "@/lib/api";
import {
  DataPagination,
  DataState,
  DataToolbar,
  PageHeader,
} from "@/components/layout";
import { Skeleton } from "@/components/ui";

import { describeKernelError } from "@/features/shell/kernel-error-message";

import { OrganizationStatusFilter } from "../components/organization-list-filters";
import { OrganizationSearchInput } from "../components/organization-search-input";
import { OrganizationsTable } from "../components/organizations-table";
import { useOrganizationListFilters } from "../view-models/use-organization-list-filters";
import { useOrganizationListPage } from "../view-models/use-organization-list-page";
import { CreateOrganizationDialog } from "../forms/create-organization-dialog";

export function OrganizationsListContainer() {
  const {
    filters: urlFilters,
    setStatus,
    setQuery,
  } = useOrganizationListFilters();
  // Distrito 4845 is a fixed tenant context in this Web. The operational
  // directory is therefore the club directory; the underlying Kernel keeps
  // its generic Organization aggregate and hierarchy intact.
  const filters = { ...urlFilters, type: "CLUB" as const };
  const page = useOrganizationListPage(filters);
  const canCreate = useCan("kernel.organization.create");

  return (
    <>
      <PageHeader
        title="Clubes"
        description="Clubes del Distrito 4845 y su información institucional."
        actions={canCreate ? <CreateOrganizationDialog /> : undefined}
      />

      <DataToolbar
        search={
          <OrganizationSearchInput value={filters.query} onCommit={setQuery} />
        }
        filters={
          <OrganizationStatusFilter
            value={filters.status}
            onChange={setStatus}
          />
        }
      />

      {page.isLoading ? (
        <div className="flex flex-col gap-2 mt-4">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : page.isError ? (
        <DataState kind="error" {...describeKernelError(page.error)} />
      ) : page.items.length === 0 ? (
        <DataState
          kind="empty"
          title="Sin clubes"
          description="No encontramos clubes con estos filtros."
        />
      ) : (
        <>
          <OrganizationsTable items={page.items} />
          <DataPagination
            summary={`${page.items.length} club(es) en esta página`}
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
