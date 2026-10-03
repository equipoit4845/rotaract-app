"use client";

import type { MyAppAccess } from "@/lib/api";
import {
  useInvalidateMyAccess,
  useMyAppAccess,
  useMyAppAccessEvents,
  useRevokeOAuthConsent,
} from "@/lib/api";
import { ConfirmationDialog, DataState, PageHeader } from "@/components/layout";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
} from "@/components/ui";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

import { describeKernelError } from "@/features/shell/kernel-error-message";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** E11.2: what this app did with the person's data, newest first. */
function AccessHistory({ appId }: { appId: string }) {
  const events = useMyAppAccessEvents(appId);
  if (events.isLoading) return <Skeleton className="h-16" />;
  if (events.isError)
    return (
      <p className="text-sm text-destructive">
        {describeKernelError(events.error).title}
      </p>
    );
  const items = events.data?.pages.flatMap((page) => page.items) ?? [];
  if (items.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        No hay accesos registrados en los últimos 12 meses.
      </p>
    );
  return (
    <div className="flex flex-col gap-2">
      <ol className="space-y-1.5">
        {items.map((item) => (
          <li key={item.id} className="text-sm">
            <span className="text-muted-foreground">
              {formatDateTime(item.occurredAt)}
            </span>{" "}
            · {item.description}
          </li>
        ))}
      </ol>
      {events.hasNextPage ? (
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={events.isFetchingNextPage}
            onClick={() => void events.fetchNextPage()}
          >
            Ver más
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function AppAccessCard({
  access,
  onRemove,
}: {
  access: MyAppAccess;
  onRemove: (access: MyAppAccess) => void;
}) {
  const [open, setOpen] = useState(false);
  const historyId = `history-${access.appId}`;
  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>{access.appName}</CardTitle>
          <CardDescription>
            De {access.organizationName}
            {access.connected && access.grantedAt
              ? ` · Conectada desde el ${formatDate(access.grantedAt)}`
              : ""}
            {access.lastAccessAt
              ? ` · Último acceso: ${formatDate(access.lastAccessAt)}`
              : ""}
          </CardDescription>
        </div>
        {access.connected ? (
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={() => onRemove(access)}
          >
            Quitar acceso
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {access.connected ? (
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Puede ver
            </p>
            <ul className="space-y-1.5">
              {access.scopes.map((scope) => (
                <li
                  key={scope.scope}
                  className="flex items-start gap-2 text-sm"
                >
                  <Check
                    className="mt-0.5 size-4 shrink-0 text-success"
                    aria-hidden
                  />
                  {scope.label}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Esta app no la conectaste vos: la usa tu club o el distrito y lee
            tus datos con su propio permiso. Si tenés dudas, hablá con tu club o
            con el distrito.
          </p>
        )}
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={open}
            aria-controls={historyId}
            trailingIcon={
              open ? (
                <ChevronUp className="size-4" aria-hidden />
              ) : (
                <ChevronDown className="size-4" aria-hidden />
              )
            }
            onClick={() => setOpen((value) => !value)}
          >
            {open
              ? "Ocultar historial"
              : `Ver historial de accesos (${access.accessCount})`}
          </Button>
          {open ? (
            <div id={historyId} className="mt-2">
              <AccessHistory appId={access.appId} />
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * `/connected-apps` — apps that reached the signed-in person's data (E11.2):
 * the ones they let in with "Ingresar con Mi Rotaract" (with "Quitar
 * acceso") and the ones their club or district uses, each with its access
 * history of the last 12 months.
 */
export function ConnectedAppsContainer() {
  const apps = useMyAppAccess();
  const revoke = useRevokeOAuthConsent();
  const refresh = useInvalidateMyAccess();
  const [toRemove, setToRemove] = useState<MyAppAccess | null>(null);

  return (
    <>
      <PageHeader
        title="Apps conectadas"
        description="Qué apps accedieron a tus datos, qué pueden ver y cuándo lo hicieron. Las que conectaste vos las podés desconectar."
      />

      {apps.isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : apps.isError ? (
        <DataState kind="error" {...describeKernelError(apps.error)} />
      ) : !apps.data || apps.data.length === 0 ? (
        <DataState
          kind="empty"
          title="No tenés apps conectadas"
          description="Cuando ingreses a una app con tu cuenta de Mi Rotaract, o una app del distrito lea tus datos, la vas a ver acá."
        />
      ) : (
        <ul className="grid gap-4">
          {apps.data.map((access) => (
            <li key={access.appId}>
              <AppAccessCard
                access={access}
                onRemove={(item) => {
                  revoke.reset();
                  setToRemove(item);
                }}
              />
            </li>
          ))}
        </ul>
      )}

      <ConfirmationDialog
        open={toRemove !== null}
        onOpenChange={(open) => {
          if (!open) setToRemove(null);
        }}
        title="Quitar acceso"
        description={
          toRemove
            ? `${toRemove.appName} deja de poder ver tus datos y se cierra tu sesión en esa app. Si volvés a ingresar, te va a pedir permiso de nuevo.`
            : ""
        }
        confirmLabel="Quitar acceso"
        confirmVariant="danger"
        isPending={revoke.isPending}
        errorMessage={
          revoke.isError ? describeKernelError(revoke.error) : undefined
        }
        onConfirm={() => {
          if (!toRemove) return;
          revoke.mutate(toRemove.appId, {
            onSuccess: () => {
              setToRemove(null);
              void refresh();
            },
          });
        }}
      />
    </>
  );
}
