"use client";

import { useMyApps } from "@/lib/api";
import { DataState, PageHeader } from "@/components/layout";
import { Skeleton } from "@/components/ui";

import { describeKernelError } from "@/features/shell/kernel-error-message";

import { AppTileGrid } from "../components/my-apps-grid";

/** `/apps` — every app the district published for the signed-in person. */
export function MyAppsContainer() {
  const apps = useMyApps();
  return (
    <>
      <PageHeader
        title="Aplicaciones"
        description="Apps del distrito para vos. Se abren en una pestaña nueva; la primera vez te piden permiso para ver tus datos."
      />
      {apps.isLoading ? (
        <Skeleton className="h-28" />
      ) : apps.isError ? (
        <DataState kind="error" {...describeKernelError(apps.error)} />
      ) : !apps.data || apps.data.length === 0 ? (
        <DataState
          kind="empty"
          title="Todavía no hay aplicaciones para vos"
          description="Cuando el distrito publique una app para tu cargo o tu club, la vas a ver acá."
        />
      ) : (
        <AppTileGrid apps={apps.data} />
      )}
    </>
  );
}
