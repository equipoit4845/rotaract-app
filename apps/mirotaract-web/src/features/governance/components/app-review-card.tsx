"use client";

import type { DeveloperApp } from "@/lib/api";
import {
  useRequestDeveloperAppReview,
  useReviewHistory,
  useUpdateDeveloperApp,
} from "@/lib/api";
import { StatusBadge } from "@/components/domain/status-badge";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FormField,
  Input,
  Textarea,
} from "@/components/ui";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { dataLabel } from "@/features/developer-apps/utils/app-catalog";
import { describeKernelError } from "@/features/shell/kernel-error-message";

import { reviewLimitations } from "../utils/governance-labels";
import { ReviewHistory } from "./review-history";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Purpose, privacy policy, contact and test accounts (what the RDR checks). */
function GovernanceFieldsForm({ app }: { app: DeveloperApp }) {
  const update = useUpdateDeveloperApp();
  const [purpose, setPurpose] = useState(app.purpose ?? "");
  const [privacyPolicyUrl, setPrivacy] = useState(app.privacyPolicyUrl ?? "");
  const [contactEmail, setContact] = useState(app.contactEmail ?? "");
  const [testers, setTesters] = useState(
    (app.testAccountEmails ?? []).join("\n"),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const testAccountEmails = testers
      .split(/[\s,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    const next: Record<string, string> = {};
    if (privacyPolicyUrl.trim() && !/^https:\/\//.test(privacyPolicyUrl.trim()))
      next.privacy = "Tiene que ser una dirección https.";
    if (contactEmail.trim() && !EMAIL.test(contactEmail.trim()))
      next.contact = "Escribí un correo válido.";
    const invalid = testAccountEmails.find((email) => !EMAIL.test(email));
    if (invalid) next.testers = `${invalid} no es un correo válido.`;
    if (testAccountEmails.length > 20)
      next.testers = "Podés cargar hasta 20 cuentas de prueba.";
    setErrors(next);
    setSaved(false);
    if (Object.keys(next).length) return;
    update.mutate(
      {
        appId: app.id,
        payload: {
          purpose: purpose.trim() || null,
          privacyPolicyUrl: privacyPolicyUrl.trim() || null,
          contactEmail: contactEmail.trim() || null,
          testAccountEmails,
        },
      },
      { onSuccess: () => setSaved(true) },
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormField
        label="Para qué es la app"
        htmlFor="gov-purpose"
        hint="Quién la usa y qué problema resuelve."
      >
        <Textarea
          id="gov-purpose"
          value={purpose}
          maxLength={1000}
          onChange={(event) => setPurpose(event.target.value)}
        />
      </FormField>
      <FormField
        label="Política de privacidad"
        htmlFor="gov-privacy"
        error={errors.privacy}
        hint="Dirección https donde explicás qué datos guardás, para qué y por cuánto tiempo."
      >
        <Input
          id="gov-privacy"
          type="url"
          value={privacyPolicyUrl}
          onChange={(event) => setPrivacy(event.target.value)}
        />
      </FormField>
      <FormField
        label="Correo de contacto"
        htmlFor="gov-contact"
        error={errors.contact}
      >
        <Input
          id="gov-contact"
          type="email"
          value={contactEmail}
          onChange={(event) => setContact(event.target.value)}
        />
      </FormField>
      <FormField
        label="Cuentas de prueba"
        htmlFor="gov-testers"
        error={errors.testers}
        hint="Correos de las cuentas de Mi Rotaract que pueden ingresar mientras la app está en revisión (uno por línea, hasta 20)."
      >
        <Textarea
          id="gov-testers"
          value={testers}
          onChange={(event) => setTesters(event.target.value)}
        />
      </FormField>
      {update.isError ? (
        <Alert tone="danger" {...describeKernelError(update.error)} />
      ) : null}
      {saved ? <p className="text-sm text-success">Guardado.</p> : null}
      <div>
        <Button type="submit" disabled={update.isPending}>
          Guardar datos para la revisión
        </Button>
      </div>
    </form>
  );
}

/**
 * The district's review of the app (E11.1) in its console: status, what is
 * limited meanwhile, the RDR's reason after a rejection, the checklist data
 * and the history.
 */
export function AppReviewCard({
  app,
  canManage,
  canReview,
}: {
  app: DeveloperApp;
  canManage: boolean;
  canReview: boolean;
}) {
  const history = useReviewHistory(app.id);
  const requestReview = useRequestDeveloperAppReview();
  const limitations = reviewLimitations(app);
  const pending = app.scopes.filter(
    (scope) => !(app.approvedScopes ?? []).includes(scope),
  );
  const lastRejection = history.data?.find(
    (entry) => entry.kind === "REJECTED",
  );
  const status = app.reviewStatus ?? "APPROVED";
  const editable = canManage && app.status !== "REVOKED";

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Revisión del distrito</CardTitle>
          <CardDescription>
            Antes de usar datos personales de los socios, el RDR revisa el
            propósito, los datos que pide, la persona responsable, la política
            de privacidad y el contacto.
          </CardDescription>
        </div>
        <StatusBadge kind="developerAppReview" status={status} />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {status === "IN_REVIEW" ? (
          <Alert
            tone="info"
            title={
              app.approvedAt
                ? "Pidió datos nuevos: el distrito los está revisando"
                : "En revisión del distrito"
            }
            description={
              app.approvedAt
                ? `Lo ya aprobado sigue funcionando. Mientras tanto, esto solo sirve para la persona responsable y las cuentas de prueba: ${pending.map((scope) => dataLabel(scope).toLowerCase()).join(", ")}.`
                : "Podés probarla, pero con límites hasta que el RDR la apruebe."
            }
          />
        ) : null}
        {status === "REJECTED" ? (
          <Alert
            tone="danger"
            title="El distrito pidió cambios"
            description={
              lastRejection?.reason
                ? `Motivo: “${lastRejection.reason}”. Corregí lo que pide y volvé a pedir la revisión.`
                : "Corregí lo que pide y volvé a pedir la revisión."
            }
            action={
              editable ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={requestReview.isPending}
                  onClick={() => requestReview.mutate(app.id)}
                >
                  Pedir revisión de nuevo
                </Button>
              ) : undefined
            }
          />
        ) : null}
        {requestReview.isError ? (
          <Alert tone="danger" {...describeKernelError(requestReview.error)} />
        ) : null}
        {status === "APPROVED" ? (
          <p className="text-sm text-muted-foreground">
            Aprobada: puede usar los datos que pide con cualquier persona dentro
            de su alcance.
          </p>
        ) : null}

        {limitations.length > 0 ? (
          <div>
            <p className="mb-1 text-sm font-medium">
              Mientras tanto, lo que está limitado
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {limitations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {canReview && status === "IN_REVIEW" ? (
          <div>
            <Link
              href={`/developer/reviews/${app.id}`}
              className="text-sm font-medium text-primary hover:underline"
            >
              Revisar esta app
            </Link>
          </div>
        ) : null}

        {editable ? (
          <div className="border-t pt-4">
            <p className="mb-3 text-sm font-medium">Datos para la revisión</p>
            <GovernanceFieldsForm app={app} />
          </div>
        ) : null}

        <div className="border-t pt-4">
          <p className="mb-2 text-sm font-medium">Historial de la revisión</p>
          <ReviewHistory appId={app.id} />
        </div>
      </CardContent>
    </Card>
  );
}
