"use client";

import type {
  DeveloperApp,
  DeveloperAppSecretCreated,
  DeveloperAppSecretSummary,
} from "@/lib/api";
import {
  useRevokeDeveloperAppSecret,
  useRotateDeveloperAppSecret,
} from "@/lib/api";
import { ConfirmationDialog, DataState } from "@/components/layout";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import { KeyRound } from "lucide-react";
import { useState } from "react";

import { describeKernelError } from "@/features/shell/kernel-error-message";

import { formatDate, formatDateTime } from "../utils/app-catalog";
import { SecretRevealDialog } from "./secret-reveal-dialog";

function secretState(secret: DeveloperAppSecretSummary): {
  label: string;
  tone: "success" | "warning" | "danger" | "neutral";
} {
  if (secret.revokedAt) return { label: "Revocado", tone: "danger" };
  if (secret.expiresAt && new Date(secret.expiresAt) <= new Date()) {
    return { label: "Vencido", tone: "neutral" };
  }
  if (secret.expiresAt) return { label: "Por vencer", tone: "warning" };
  return { label: "Vigente", tone: "success" };
}

function isUsable(secret: DeveloperAppSecretSummary): boolean {
  const { tone } = secretState(secret);
  return tone === "success" || tone === "warning";
}

/**
 * Secrets of a server app. The full secret is never listed — only its last
 * four characters. A new one is shown once; the previous ones keep working
 * for 7 days so the app can be updated without downtime.
 */
export function AppSecretsCard({
  app,
  canManage,
}: {
  app: DeveloperApp;
  canManage: boolean;
}) {
  const rotate = useRotateDeveloperAppSecret();
  const revoke = useRevokeDeveloperAppSecret();
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [newSecret, setNewSecret] = useState<DeveloperAppSecretCreated | null>(
    null,
  );
  const [toRevoke, setToRevoke] = useState<DeveloperAppSecretSummary | null>(
    null,
  );

  const editable = canManage && app.status !== "REVOKED";
  const secrets = [...app.secrets].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Secretos</CardTitle>
          <CardDescription>
            La app usa su identificador y un secreto para conectarse. Por
            seguridad, del secreto solo mostramos los últimos 4 caracteres.
          </CardDescription>
        </div>
        {editable ? (
          <Button
            type="button"
            variant="outline"
            leadingIcon={<KeyRound className="size-4" aria-hidden />}
            onClick={() => {
              rotate.reset();
              setConfirmRotate(true);
            }}
          >
            Crear secreto nuevo
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {secrets.length === 0 ? (
          <DataState
            kind="empty"
            title="Sin secretos"
            description="Esta app no tiene secretos vigentes."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Secreto</TableHead>
                <TableHead>Creado</TableHead>
                <TableHead>Vence</TableHead>
                <TableHead>Último uso</TableHead>
                <TableHead>Estado</TableHead>
                {editable ? (
                  <TableHead className="text-right">Acción</TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {secrets.map((secret) => {
                const state = secretState(secret);
                return (
                  <TableRow key={secret.id}>
                    <TableCell className="font-mono">
                      ••••{secret.hint}
                    </TableCell>
                    <TableCell>{formatDate(secret.createdAt)}</TableCell>
                    <TableCell>
                      {secret.revokedAt
                        ? `Revocado el ${formatDate(secret.revokedAt)}`
                        : (formatDateTime(secret.expiresAt) ?? "No vence")}
                    </TableCell>
                    <TableCell>
                      {formatDateTime(secret.lastUsedAt) ?? "Nunca"}
                    </TableCell>
                    <TableCell>
                      <Badge tone={state.tone}>{state.label}</Badge>
                    </TableCell>
                    {editable ? (
                      <TableCell className="text-right">
                        {isUsable(secret) ? (
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            aria-label={`Revocar secreto terminado en ${secret.hint}`}
                            onClick={() => {
                              revoke.reset();
                              setToRevoke(secret);
                            }}
                          >
                            Revocar
                          </Button>
                        ) : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <ConfirmationDialog
        open={confirmRotate}
        onOpenChange={setConfirmRotate}
        title="Crear secreto nuevo"
        description="Vamos a generar un secreto nuevo y mostrártelo una sola vez. El secreto anterior sigue funcionando 7 días más, así da tiempo a actualizar la app."
        confirmLabel="Crear secreto"
        isPending={rotate.isPending}
        errorMessage={
          rotate.isError ? describeKernelError(rotate.error) : undefined
        }
        onConfirm={() =>
          rotate.mutate(app.id, {
            onSuccess: (created) => {
              setConfirmRotate(false);
              setNewSecret(created);
            },
          })
        }
      />

      <ConfirmationDialog
        open={toRevoke !== null}
        onOpenChange={(open) => {
          if (!open) setToRevoke(null);
        }}
        title="Revocar secreto"
        description={
          toRevoke
            ? `El secreto terminado en ${toRevoke.hint} deja de funcionar en el acto. Si la app todavía lo usa, no va a poder conectarse hasta que tenga uno nuevo.`
            : ""
        }
        confirmLabel="Revocar secreto"
        confirmVariant="danger"
        isPending={revoke.isPending}
        errorMessage={
          revoke.isError ? describeKernelError(revoke.error) : undefined
        }
        onConfirm={() => {
          if (!toRevoke) return;
          revoke.mutate(
            { appId: app.id, secretId: toRevoke.id },
            { onSuccess: () => setToRevoke(null) },
          );
        }}
      />

      {newSecret ? (
        <SecretRevealDialog
          open
          title="Secreto nuevo"
          description={`Este es el secreto nuevo de ${app.name}.`}
          clientId={app.clientId}
          secret={newSecret.secret}
          note={
            <Alert
              tone="info"
              title="El secreto anterior sigue funcionando 7 días"
              description="Actualizá la app con el secreto nuevo antes de que venza el anterior."
            />
          }
          onDone={() => setNewSecret(null)}
        />
      ) : null}
    </Card>
  );
}
