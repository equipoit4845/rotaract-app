"use client";

import type {
  ModuleDefinition,
  ModuleInstallation,
  ModuleManifestView,
} from "@/lib/api";
import { StatusBadge } from "@/components/domain/status-badge";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  buttonVariants,
} from "@/components/ui";
import { Blocks, Check, ExternalLink } from "lucide-react";

export type ModuleAction =
  "install" | "activate" | "configure" | "suspend" | "uninstall" | "publish";

/**
 * One module of the catalog, as seen from the active club (or district):
 * what it is, what it lets people do, whether it's on here, and the actions
 * the signed-in person may take. Permission codes never reach the screen.
 */
export function ModuleCard({
  module,
  installation,
  can,
  onAction,
}: {
  module: ModuleDefinition;
  installation?: ModuleInstallation;
  can: {
    install: boolean;
    configure: boolean;
    disable: boolean;
    publish: boolean;
  };
  onAction: (action: ModuleAction) => void;
}) {
  const manifest = (module.manifest ?? {}) as ModuleManifestView;
  const permissions = module.permissions ?? manifest.permissions ?? [];
  const status =
    installation && installation.status !== "DISABLED"
      ? installation.status
      : undefined;
  const hasConfiguration =
    Object.keys(
      (module.configurationSchema as { properties?: object } | null)
        ?.properties ?? {},
    ).length > 0;
  const entryUrl = manifest.ui?.entryUrl;
  const deprecated = module.status === "DEPRECATED";

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Blocks className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">{module.name}</CardTitle>
              {status ? (
                <StatusBadge kind="moduleInstallation" status={status} />
              ) : (
                <Badge tone="neutral">No instalado</Badge>
              )}
              {deprecated ? <Badge tone="warning">Discontinuado</Badge> : null}
            </div>
            <CardDescription>
              {module.description ?? manifest.description ?? "Sin descripción."}
            </CardDescription>
            <p className="text-xs text-muted-foreground">
              Versión {module.version}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        {permissions.length ? (
          <>
            <p className="mb-2 text-sm font-medium">Qué permite hacer</p>
            <ul className="space-y-1.5">
              {permissions.slice(0, 4).map((permission) => (
                <li
                  key={permission.code}
                  className="flex items-start gap-2 text-sm text-muted-foreground"
                >
                  <Check
                    className="mt-0.5 size-3.5 shrink-0 text-success"
                    aria-hidden
                  />
                  {permission.name}
                </li>
              ))}
            </ul>
            {permissions.length > 4 ? (
              <p className="mt-1.5 text-xs text-muted-foreground">
                y {permissions.length - 4} más.
              </p>
            ) : null}
            <p className="mt-3 text-xs text-muted-foreground">
              El distrito decide qué cargos tienen cada uno, desde Cargos.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            No agrega permisos propios.
          </p>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        {!status ? (
          can.install && !deprecated && module.status === "ACTIVE" ? (
            <Button type="button" onClick={() => onAction("install")}>
              Instalar
            </Button>
          ) : null
        ) : null}
        {status === "ACTIVE" && entryUrl ? (
          <a
            href={entryUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "primary" })}
          >
            Abrir
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        ) : null}
        {(status === "PENDING" || status === "SUSPENDED") && can.install ? (
          <Button type="button" onClick={() => onAction("activate")}>
            Activar
          </Button>
        ) : null}
        {status && hasConfiguration && can.configure ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => onAction("configure")}
          >
            Configurar
          </Button>
        ) : null}
        {status === "ACTIVE" && can.disable ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => onAction("suspend")}
          >
            Desactivar
          </Button>
        ) : null}
        {status && can.disable ? (
          <Button
            type="button"
            variant="danger"
            onClick={() => onAction("uninstall")}
          >
            Desinstalar
          </Button>
        ) : null}
        {can.publish ? (
          <Button
            type="button"
            variant="ghost"
            className="ml-auto"
            onClick={() => onAction("publish")}
          >
            Publicar versión
          </Button>
        ) : null}
      </CardFooter>
    </Card>
  );
}
