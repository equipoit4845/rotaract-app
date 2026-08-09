"use client";

import type { InstitutionalPeriod } from "@/lib/api";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@equipoit4845/ui";

import {
  periodStatusToLabel,
  periodStatusToTone,
} from "../adapters/period-status-to-tone";
import { formatDate } from "../utils/format-date";

function Field({
  label,
  value,
}: {
  label: string;
  value: string | undefined | null;
}) {
  return (
    <div>
      <dt
        style={{
          fontSize: "0.75rem",
          color: "var(--mr-color-text-muted)",
          margin: 0,
        }}
      >
        {label}
      </dt>
      <dd style={{ margin: 0 }}>{value?.trim() ? value : "—"}</dd>
    </div>
  );
}

export function PeriodSummaryCard({ period }: { period: InstitutionalPeriod }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Resumen</CardTitle>
      </CardHeader>
      <CardContent>
        <dl
          style={{
            display: "grid",
            gap: "var(--mr-space-4)",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            margin: 0,
          }}
        >
          <Field label="Nombre" value={period.name} />
          <Field label="Código" value={period.code} />
          <Field label="Secuencia" value={String(period.sequence)} />
          <div>
            <dt
              style={{
                fontSize: "0.75rem",
                color: "var(--mr-color-text-muted)",
                margin: 0,
              }}
            >
              Estado
            </dt>
            <dd style={{ margin: 0 }}>
              <Badge tone={periodStatusToTone(period.status)}>
                {periodStatusToLabel(period.status)}
              </Badge>
            </dd>
          </div>
          <Field label="Inicio" value={formatDate(period.startDate)} />
          <Field label="Fin" value={formatDate(period.endDate)} />
          <Field label="Creado" value={formatDate(period.createdAt)} />
          <Field label="Actualizado" value={formatDate(period.updatedAt)} />
          {period.closedAt ? (
            <Field label="Cerrado" value={formatDate(period.closedAt)} />
          ) : null}
        </dl>
      </CardContent>
    </Card>
  );
}
