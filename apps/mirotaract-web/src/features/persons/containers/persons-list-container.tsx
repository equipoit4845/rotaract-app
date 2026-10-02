"use client";

import {
  useAdministrativeUserDirectory,
  useCan,
  useCurrentUser,
} from "@/lib/api";
import {
  DataPagination,
  DataState,
  DataToolbar,
  PageHeader,
} from "@/components/layout";
import { Skeleton } from "@/components/ui";
import { useMemo, useState } from "react";

import { describeKernelError } from "@/features/shell/kernel-error-message";

import { CreatePersonDialog } from "../forms/create-person-dialog";
import { PersonSearchInput } from "../components/person-search-input";
import { PersonsTable } from "../components/persons-table";
import { SuperadminUsersTable } from "../components/superadmin-users-table";
import { useSuperadminModeContext } from "@/features/shell/superadmin-mode-context";
import { usePersonListFilters } from "../view-models/use-person-list-filters";
import { usePersonListPage } from "../view-models/use-person-list-page";

export function PersonsListContainer() {
  const { data: currentUser } = useCurrentUser();
  const { mode } = useSuperadminModeContext();

  if (currentUser?.platformRole === "SUPERADMIN" && mode === "ADMIN") {
    return <SuperadminUsersDirectory />;
  }

  return <PersonsDirectory />;
}

function PersonsDirectory() {
  const { filters, setQuery } = usePersonListFilters();
  const page = usePersonListPage(filters);
  const canCreate = useCan("kernel.person.manage");

  return (
    <>
      <PageHeader
        title="Personas y socios"
        description="Personas registradas y sus relaciones con clubes."
        actions={canCreate ? <CreatePersonDialog /> : undefined}
      />

      <DataToolbar
        search={<PersonSearchInput value={filters.query} onCommit={setQuery} />}
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

/** Global directory is intentionally a SUPERADMIN-only screen. */
function SuperadminUsersDirectory() {
  const [query, setQuery] = useState("");
  const directory = useAdministrativeUserDirectory(true);
  const normalizedQuery = query.trim().toLocaleLowerCase("es");
  const items = useMemo(
    () =>
      directory.items.filter((item) => {
        if (!normalizedQuery) return true;
        return [
          item.displayName,
          item.email ?? "",
          ...item.clubs,
          ...item.roles,
        ]
          .join(" ")
          .toLocaleLowerCase("es")
          .includes(normalizedQuery);
      }),
    [directory.items, normalizedQuery],
  );

  return (
    <>
      <PageHeader
        title="Usuarios"
        description="Directorio completo: persona, club activo y roles vigentes."
      />
      <DataToolbar
        search={<PersonSearchInput value={query} onCommit={setQuery} />}
      />
      {directory.isLoading ? (
        <div className="flex flex-col gap-2 mt-4">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : directory.isError ? (
        <DataState kind="error" {...describeKernelError(directory.error)} />
      ) : items.length === 0 ? (
        <DataState
          kind="empty"
          title="Sin usuarios"
          description="No encontramos usuarios con esta búsqueda."
        />
      ) : (
        <>
          <SuperadminUsersTable items={items} />
          <DataPagination
            summary={`${items.length} usuario(s) en el directorio`}
            hasPrevious={false}
            hasNext={false}
            onPrevious={() => undefined}
            onNext={() => undefined}
          />
        </>
      )}
    </>
  );
}
