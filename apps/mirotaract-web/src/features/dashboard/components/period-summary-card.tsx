"use client";

import type { InstitutionalPeriod } from "@/lib/api";
import { DataState } from "@equipoit4845/admin-shell";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from "@equipoit4845/ui";

import { describeKernelError } from "@/features/shell/kernel-error-message";

import { formatDate } from "../utils/format-date";

export function PeriodSummaryCard({
  period,
  isLoading,
  isError,
  error,
}: {
  period: InstitutionalPeriod | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Período actual</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--mr-space-2)",
            }}
          >
            <Skeleton style={{ height: "1.5rem" }} />
            <Skeleton style={{ height: "1.5rem" }} />
          </div>
        ) : isError ? (
          <DataState kind="error" {...describeKernelError(error)} />
        ) : !period ? (
          <DataState
            kind="empty"
            title="Sin período activo"
            description="Esta organización no tiene un período vigente."
          />
        ) : (
          <dl
            style={{
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: "var(--mr-space-3)",
            }}
          >
            <div>
              <dt
                style={{
                  fontSize: "0.75rem",
                  color: "var(--mr-color-text-muted)",
                }}
              >
                Nombre
              </dt>
              <dd style={{ margin: 0 }}>{period.name}</dd>
            </div>
            <div>
              <dt
                style={{
                  fontSize: "0.75rem",
                  color: "var(--mr-color-text-muted)",
                }}
              >
                Vigencia
              </dt>
              <dd style={{ margin: 0 }}>
                {formatDate(period.startDate)} – {formatDate(period.endDate)}
              </dd>
            </div>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
