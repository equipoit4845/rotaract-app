"use client";

import type { Organization } from "@/lib/api";
import { useOrganization } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

import { organizationTypeToLabel } from "../adapters/organization-type-to-label";
import { formatDate } from "../utils/format-date";
import { DetailGrid, DetailItem } from "@/components/layout";

function Field({
  label,
  value,
}: {
  label: string;
  value: string | undefined | null;
}) {
  return <DetailItem label={label}>{value}</DetailItem>;
}

/**
 * A single detail page = a single organization, so resolving its one
 * parent's name here is one bounded extra request — not the per-row
 * pattern the list view has to actively guard against (§18).
 */
export function OrganizationSummaryCard({
  organization,
}: {
  organization: Organization;
}) {
  const { data: parent } = useOrganization(organization.parentId ?? undefined);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resumen</CardTitle>
      </CardHeader>
      <CardContent>
        <DetailGrid>
          <Field label="Nombre" value={organization.name} />
          <Field label="Código" value={organization.code} />
          <Field label="Slug" value={organization.slug} />
          <Field
            label="Tipo"
            value={organizationTypeToLabel(organization.type)}
          />
          <Field
            label="Organización padre"
            value={organization.parentId ? (parent?.name ?? "…") : undefined}
          />
          <Field label="País" value={organization.countryCode} />
          <Field label="Región" value={organization.region} />
          <Field label="Ciudad" value={organization.city} />
          <Field label="Email de contacto" value={organization.contactEmail} />
          <Field
            label="Teléfono de contacto"
            value={organization.contactPhone}
          />
          <Field
            label="Fundada"
            value={
              organization.foundedAt
                ? formatDate(organization.foundedAt)
                : undefined
            }
          />
          <Field label="Creada" value={formatDate(organization.createdAt)} />
          <Field
            label="Actualizada"
            value={formatDate(organization.updatedAt)}
          />
          {organization.archivedAt ? (
            <Field
              label="Archivada"
              value={formatDate(organization.archivedAt)}
            />
          ) : null}
        </DetailGrid>
        {organization.description ? (
          <p style={{ marginTop: "var(--mr-space-4)" }}>
            {organization.description}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
