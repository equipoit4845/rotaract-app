"use client";

import type { MyApp } from "@/lib/api";
import { useMyApps } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
} from "@/components/ui";
import { ExternalLink } from "lucide-react";

import { AppIcon } from "./app-icon";

/** One app the district published for this person; opens in a new tab. */
export function AppTile({ app }: { app: MyApp }) {
  return (
    <a
      href={app.launchUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-start gap-3 rounded-lg border bg-background p-4 transition-colors hover:border-primary/40 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <AppIcon icon={app.icon} className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 font-medium">
          {app.name}
          <ExternalLink
            aria-hidden
            className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
          />
          <span className="sr-only">(se abre en una pestaña nueva)</span>
        </span>
        {app.description ? (
          <span className="mt-0.5 block text-sm text-muted-foreground">
            {app.description}
          </span>
        ) : null}
      </span>
    </a>
  );
}

export function AppTileGrid({ apps }: { apps: MyApp[] }) {
  return (
    <ul className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
      {apps.map((app) => (
        <li key={app.appId}>
          <AppTile app={app} />
        </li>
      ))}
    </ul>
  );
}

/**
 * "Aplicaciones" on the home page (E11.4): the apps the district published
 * for this person. Hidden when there are none (or the request failed: it
 * is a shortcut, never a reason to break the dashboard).
 */
export function MyAppsCard() {
  const apps = useMyApps();
  if (apps.isLoading)
    return (
      <Skeleton className="mt-6 h-28" aria-label="Cargando aplicaciones" />
    );
  if (!apps.data || apps.data.length === 0) return null;
  return (
    <Card className="mt-6">
      <CardHeader>
        <div>
          <CardTitle>Aplicaciones</CardTitle>
          <CardDescription>
            Apps del distrito para vos. Se abren en una pestaña nueva y entrás
            con tu cuenta de Mi Rotaract.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <AppTileGrid apps={apps.data} />
      </CardContent>
    </Card>
  );
}
