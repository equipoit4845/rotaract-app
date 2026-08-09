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

import { CreatePersonDialog } from "../forms/create-person-dialog";
import { PersonSearchInput } from "../components/person-search-input";
import { PersonsTable } from "../components/persons-table";
import { usePersonListFilters } from "../view-models/use-person-list-filters";
import { usePersonListPage } from "../view-models/use-person-list-page";

export function PersonsListContainer() {
  const { filters, setQuery } = usePersonListFilters();
  const page = usePersonListPage(filters);
  const canCreate = useCan("kernel.person.manage");

  return (
    <>
      <PageHeader
        title="Personas"
        description="Personas registradas en la institución, con o sin cuenta vinculada."
        actions={canCreate ? <CreatePersonDialog /> : undefined}
      />

      <DataToolbar
        search={<PersonSearchInput value={filters.query} onCommit={setQuery} />}
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
          title="Sin personas"
          description="No encontramos personas con esta búsqueda."
        />
      ) : (
        <>
          <PersonsTable items={page.items} />
          <DataPagination
            summary={`${page.items.length} persona(s) en esta página`}
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
