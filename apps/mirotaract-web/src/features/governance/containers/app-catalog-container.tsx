"use client";

import type { AppCatalogItem } from "@/lib/api";
import { useAppCatalog, useUpdateAppListing } from "@/lib/api";
import { DataState, PageHeader } from "@/components/layout";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
  Switch,
} from "@/components/ui";
import { useState } from "react";

import { useActiveOrganizationContext } from "@/features/shell/active-organization-context";
import { describeKernelError } from "@/features/shell/kernel-error-message";

import { AppIcon } from "../components/app-icon";
import { AppTileGrid } from "../components/my-apps-grid";
import { AppListingForm } from "../forms/app-listing-form";
import { previewApps } from "../utils/audience-preview";
import { describeAudiences } from "../utils/governance-labels";

function CatalogRow({ item }: { item: AppCatalogItem }) {
  const update = useUpdateAppListing();
  // "publish": the editor opened because publishing needs an audience.
  const [editing, setEditing] = useState<false | "edit" | "publish">(false);
  const listing = item.listing;
  const switchId = `publish-${item.appId}`;

  function setPublished(published: boolean) {
    // Publishing needs an audience: open the editor instead.
    if (published && listing.audiences.length === 0) {
      setEditing("publish");
      return;
    }
    update.mutate({
      appId: item.appId,
      payload: {
        published,
        // First save of a suggestion: send what the RDR sees.
        ...(item.saved
          ? {}
          : {
              displayName: listing.displayName,
              shortDescription: listing.shortDescription ?? null,
              icon: listing.icon ?? null,
              launchUrl: listing.launchUrl ?? undefined,
            }),
      },
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <AppIcon icon={listing.icon} className="size-5" />
          </span>
          <div className="min-w-0">
            <CardTitle>{listing.displayName}</CardTitle>
            <CardDescription>
              {item.appName} · De {item.organizationName}
              {item.module ? " · Módulo del distrito" : ""}
            </CardDescription>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id={switchId}
            checked={listing.published}
            disabled={update.isPending}
            onCheckedChange={setPublished}
          />
          <label htmlFor={switchId} className="text-sm">
            Mostrar a los socios
          </label>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {editing ? (
          <>
            {editing === "publish" ? (
              <Alert
                tone="info"
                title="Elegí a quién mostrarle la app"
                description="Al guardar, la app aparece en el inicio de esas personas."
              />
            ) : null}
            <AppListingForm
              item={item}
              publish={editing === "publish"}
              onDone={() => setEditing(false)}
            />
          </>
        ) : (
          <>
            {listing.shortDescription ? (
              <p className="text-muted-foreground">
                {listing.shortDescription}
              </p>
            ) : null}
            <p>
              <span className="font-medium">La ven:</span>{" "}
              {describeAudiences(listing.audiences)}
            </p>
            <p className="break-all">
              <span className="font-medium">Abre:</span>{" "}
              {listing.launchUrl ?? "Falta el enlace"}
            </p>
            {!item.saved ? (
              <p className="text-muted-foreground">
                Sugerido a partir de la app
                {item.module ? " y su módulo" : ""}; todavía no se guardó.
              </p>
            ) : null}
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditing("edit")}
              >
                Editar
              </Button>
            </div>
          </>
        )}
        {update.isError ? (
          <Alert tone="danger" {...describeKernelError(update.error)} />
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * `/developer/catalog` (E11.4) — "Apps del distrito": the RDR chooses which
 * approved apps show up in the members' panel, for whom, and how; with a
 * preview of what a club president and a member see.
 */
export function AppCatalogContainer() {
  const { organizationId } = useActiveOrganizationContext();
  const catalog = useAppCatalog(organizationId);
  const items = catalog.data ?? [];

  return (
    <>
      <PageHeader
        title="Apps del distrito"
        description="Elegí qué apps aprobadas aparecen en el inicio de Mi Rotaract y para quién. Se abren en una pestaña nueva y cada persona entra con su cuenta."
      />
      {catalog.isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : catalog.isError ? (
        <DataState kind="error" {...describeKernelError(catalog.error)} />
      ) : items.length === 0 ? (
        <DataState
          kind="empty"
          title="No hay apps aprobadas para mostrar"
          description="Solo se pueden mostrar a los socios las apps activas que el distrito ya aprobó."
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <ul className="grid gap-3">
            {items.map((item) => (
              <li key={item.appId}>
                <CatalogRow item={item} />
              </li>
            ))}
          </ul>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Vista previa</CardTitle>
                <CardDescription>
                  Lo que ve cada persona en su inicio, con lo publicado.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {(
                [
                  ["president", "Una presidencia de club"],
                  ["member", "Un socio sin cargo"],
                ] as const
              ).map(([person, label]) => {
                const apps = previewApps(items, person);
                return (
                  <section key={person} aria-label={`Vista de ${label}`}>
                    <h3 className="mb-2 text-sm font-medium">{label}</h3>
                    {apps.length ? (
                      <AppTileGrid apps={apps} />
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No ve ninguna app.
                      </p>
                    )}
                  </section>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
