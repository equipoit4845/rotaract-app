"use client";

import type { InstitutionalPeriod } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

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

export function PeriodSummaryCard({ period }: { period: InstitutionalPeriod }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Resumen</CardTitle>
      </CardHeader>
      <CardContent>
        <DetailGrid>
          <Field label="Nombre" value={period.name} />
          <Field label="Código" value={period.code} />
          <Field label="Secuencia" value={String(period.sequence)} />
          <Field label="Inicio" value={formatDate(period.startDate)} />
          <Field label="Fin" value={formatDate(period.endDate)} />
          <Field label="Creado" value={formatDate(period.createdAt)} />
          <Field label="Actualizado" value={formatDate(period.updatedAt)} />
          {period.closedAt ? (
            <Field label="Cerrado" value={formatDate(period.closedAt)} />
          ) : null}
        </DetailGrid>
      </CardContent>
    </Card>
  );
}
