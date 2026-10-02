"use client";

import type { MembershipApplication } from "@/lib/api";
import { useOrganization, usePerson } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import Link from "next/link";
import type { ReactNode } from "react";

import { formatDateTime } from "../utils/format-date";
import { DetailGrid, DetailItem } from "@/components/layout";

function Field({ label, value }: { label: string; value: ReactNode }) {
  return <DetailItem label={label}>{value ?? "—"}</DetailItem>;
}

/**
 * A single detail page = a single application, so resolving its one
 * person/organization here is two bounded extra requests — not the
 * per-row pattern the list has to actively guard against (same rationale
 * as `MembershipSummaryCard`). "Solicitante" only ever shows a name, never
 * email/phone/birthDate (product spec §15). When `membershipId` is set
 * (only possible once `APPROVED`, invariant 6.8.3), it links to the
 * resulting membership's own detail page — this never duplicates
 * membership data here, only points at it.
 */
export function ApplicationSummaryCard({
  application,
}: {
  application: MembershipApplication;
}) {
  const { data: person } = usePerson(application.requesterPersonId);
  const { data: organization } = useOrganization(application.organizationId);
  const applicantName = person
    ? person.displayName?.trim() || `${person.firstName} ${person.lastName}`
    : "…";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resumen</CardTitle>
      </CardHeader>
      <CardContent>
        <DetailGrid>
          <Field
            label="Solicitante"
            value={
              <Link href={`/persons/${application.requesterPersonId}`}>
                {applicantName}
              </Link>
            }
          />
          <Field
            label="Organización"
            value={
              organization ? (
                <Link href={`/organizations/${organization.id}`}>
                  {organization.name}
                </Link>
              ) : (
                "…"
              )
            }
          />
          <Field label="Mensaje" value={application.message} />
          <Field
            label="Enviada"
            value={
              application.submittedAt
                ? formatDateTime(application.submittedAt)
                : undefined
            }
          />
          <Field
            label="Revisada"
            value={
              application.reviewedAt
                ? formatDateTime(application.reviewedAt)
                : undefined
            }
          />
          <Field
            label="Motivo de rechazo"
            value={application.rejectionReason}
          />
          <Field
            label="Membresía"
            value={
              application.membershipId ? (
                <Link href={`/memberships/${application.membershipId}`}>
                  Ver membresía
                </Link>
              ) : undefined
            }
          />
        </DetailGrid>
      </CardContent>
    </Card>
  );
}
