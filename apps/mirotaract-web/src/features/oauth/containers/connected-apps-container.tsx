"use client";

import type { OAuthConsent } from "@/lib/api";
import { useOAuthConsents, useRevokeOAuthConsent } from "@/lib/api";
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
import { Check } from "lucide-react";
import { useState } from "react";

import { describeKernelError } from "@/features/shell/kernel-error-message";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * `/connected-apps` — apps the signed-in person let in with "Ingresar con
 * Mi Rotaract". Removing access revokes the consent and signs the person
 * out of that app; next time it asks again.
 */
export function ConnectedAppsContainer() {
  const consents = useOAuthConsents();
  const revoke = useRevokeOAuthConsent();
  const [toRemove, setToRemove] = useState<OAuthConsent | null>(null);

  return (
    <>
      <PageHeader
        title="Apps conectadas"
        description="Apps en las que ingresaste con tu cuenta de Mi Rotaract y qué datos tuyos pueden ver."
      />

      {consents.isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : consents.isError ? (
        <DataState kind="error" {...describeKernelError(consents.error)} />
      ) : !consents.data || consents.data.length === 0 ? (
        <DataState
          kind="empty"
          title="No tenés apps conectadas"
          description="Cuando ingreses a una app con tu cuenta de Mi Rotaract, la vas a ver acá."
        />
      ) : (
        <ul className="grid gap-4">
          {consents.data.map((consent) => (
            <li key={consent.appId}>
              <Card>
                <CardHeader>
                  <div className="min-w-0">
                    <CardTitle>{consent.appName}</CardTitle>
                    <CardDescription>
                      De {consent.organizationName} · Conectada desde el{" "}
                      {formatDate(consent.grantedAt)}
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      revoke.reset();
                      setToRemove(consent);
                    }}
                  >
                    Quitar acceso
                  </Button>
                </CardHeader>
                <CardContent>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    Puede ver
                  </p>
                  <ul className="space-y-1.5">
                    {consent.scopes.map((scope) => (
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
                </CardContent>
              </Card>
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
            onSuccess: () => setToRemove(null),
          });
        }}
      />
    </>
  );
}
