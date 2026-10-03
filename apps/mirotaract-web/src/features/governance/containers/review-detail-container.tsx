"use client";

import type { ReviewChecklist } from "@/lib/api";
import {
  useCan,
  useDeveloperApp,
  useOrganization,
  usePerson,
  useReviewDeveloperApp,
} from "@/lib/api";
import { StatusBadge } from "@/components/domain/status-badge";
import {
  DataState,
  DetailGrid,
  DetailItem,
  EntityHero,
} from "@/components/layout";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  FormField,
  Skeleton,
  Textarea,
} from "@/components/ui";
import { useState } from "react";

import { dataLabel } from "@/features/developer-apps/utils/app-catalog";
import { describeKernelError } from "@/features/shell/kernel-error-message";

import { ReviewHistory } from "../components/review-history";
import { CHECKLIST_ITEMS, EMPTY_CHECKLIST } from "../utils/governance-labels";

function Missing() {
  return <span className="text-destructive">No lo cargó todavía</span>;
}

/**
 * `/developer/reviews/[appId]` (E11.1) — the checklist: the RDR marks each
 * point after checking it, then approves (all five) or rejects with a reason
 * the team will read.
 */
export function ReviewDetailContainer({ appId }: { appId: string }) {
  const query = useDeveloperApp(appId);
  const app = query.data;
  const organization = useOrganization(app?.organizationId);
  const owner = usePerson(app?.ownerPersonId);
  const canReview = useCan(
    "kernel.app.review",
    app
      ? { scopeType: "ORGANIZATION", scopeId: app.organizationId }
      : undefined,
  );
  const review = useReviewDeveloperApp();
  const [checklist, setChecklist] = useState<ReviewChecklist>(EMPTY_CHECKLIST);
  const [reason, setReason] = useState("");
  const [done, setDone] = useState<"approve" | "reject" | null>(null);

  if (query.isLoading) return <Skeleton className="h-64" />;
  if (query.isError || !app)
    return <DataState kind="error" {...describeKernelError(query.error)} />;

  const pending = app.scopes.filter(
    (scope) => !(app.approvedScopes ?? []).includes(scope),
  );
  const allChecked = CHECKLIST_ITEMS.every((item) => checklist[item.key]);
  const missingData =
    !app.purpose || !app.privacyPolicyUrl || !app.contactEmail;
  const waiting = app.reviewStatus === "IN_REVIEW";
  const ownerName = owner.data
    ? owner.data.displayName || `${owner.data.firstName} ${owner.data.lastName}`
    : undefined;

  function submit(decision: "approve" | "reject") {
    review.mutate(
      {
        appId,
        payload: {
          decision,
          checklist,
          reason: reason.trim() || null,
        },
      },
      { onSuccess: () => setDone(decision) },
    );
  }

  return (
    <>
      <EntityHero
        title={app.name}
        subtitle={app.description ?? undefined}
        breadcrumb={[
          { label: "Revisión de apps", href: "/developer/reviews" },
          { label: app.name },
        ]}
        badges={
          <StatusBadge
            kind="developerAppReview"
            status={app.reviewStatus ?? "APPROVED"}
          />
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          {done ? (
            <Alert
              tone="success"
              title={
                done === "approve"
                  ? "App aprobada"
                  : "Le pediste cambios al equipo"
              }
              description={
                done === "approve"
                  ? "Ya puede usar los datos que pidió con cualquier persona del distrito."
                  : "El equipo ve tu motivo en su consola y puede pedir la revisión de nuevo."
              }
            />
          ) : null}

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Lo que declaró el equipo</CardTitle>
                <CardDescription>
                  Revisá cada punto antes de marcarlo.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <DetailGrid>
                <DetailItem label="Propósito" className="col-span-full">
                  {app.purpose ?? <Missing />}
                </DetailItem>
                <DetailItem label="Datos que pide" className="col-span-full">
                  <ul className="space-y-1">
                    {app.scopes.map((scope) => (
                      <li key={scope}>
                        {dataLabel(scope)}
                        {pending.includes(scope) ? (
                          <span className="ml-2 text-xs text-warning-foreground">
                            (sin aprobar)
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </DetailItem>
                <DetailItem label="Responsable">
                  {ownerName ?? (owner.isLoading ? "…" : "Persona registrada")}
                </DetailItem>
                <DetailItem label="Organización">
                  {organization.data?.name ?? "…"}
                </DetailItem>
                <DetailItem label="Política de privacidad">
                  {app.privacyPolicyUrl ? (
                    <a
                      href={app.privacyPolicyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all text-primary hover:underline"
                    >
                      {app.privacyPolicyUrl}
                    </a>
                  ) : (
                    <Missing />
                  )}
                </DetailItem>
                <DetailItem label="Contacto">
                  {app.contactEmail ? (
                    <a
                      href={`mailto:${app.contactEmail}`}
                      className="text-primary hover:underline"
                    >
                      {app.contactEmail}
                    </a>
                  ) : (
                    <Missing />
                  )}
                </DetailItem>
              </DetailGrid>
            </CardContent>
          </Card>

          {canReview && waiting && !done ? (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Lista de control</CardTitle>
                  <CardDescription>
                    Para aprobar, marcá los cinco puntos. Para pedir cambios,
                    escribí qué tiene que corregir el equipo.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <ul className="space-y-3">
                  {CHECKLIST_ITEMS.map((item) => (
                    <li key={item.key} className="flex items-start gap-3">
                      <Checkbox
                        id={`check-${item.key}`}
                        checked={checklist[item.key]}
                        onCheckedChange={(value) =>
                          setChecklist((current) => ({
                            ...current,
                            [item.key]: value === true,
                          }))
                        }
                        className="mt-0.5"
                      />
                      <label htmlFor={`check-${item.key}`} className="text-sm">
                        <span className="font-medium">{item.label}</span>
                        <span className="block text-muted-foreground">
                          {item.hint}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                {missingData ? (
                  <Alert
                    tone="warning"
                    title="Falta información para aprobar"
                    description="El equipo todavía no cargó el propósito, la política de privacidad o el contacto. Podés pedirle que los cargue."
                  />
                ) : null}
                <FormField
                  label="Motivo (obligatorio para pedir cambios)"
                  htmlFor="review-reason"
                  hint="Lo lee el equipo de la app. Decí qué tiene que cambiar."
                >
                  <Textarea
                    id="review-reason"
                    value={reason}
                    maxLength={1000}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </FormField>
                {review.isError ? (
                  <Alert tone="danger" {...describeKernelError(review.error)} />
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    disabled={!allChecked || missingData || review.isPending}
                    onClick={() => submit("approve")}
                  >
                    Aprobar
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    disabled={reason.trim().length < 10 || review.isPending}
                    onClick={() => submit("reject")}
                  >
                    Pedir cambios
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : !waiting && !done ? (
            <Alert
              tone="info"
              title="Esta app no está esperando revisión"
              description="Cuando el equipo pida datos nuevos o vuelva a pedir la revisión, vas a poder revisarla de nuevo."
            />
          ) : null}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Historial</CardTitle>
          </CardHeader>
          <CardContent>
            <ReviewHistory appId={appId} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
