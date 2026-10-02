"use client";

import type { InstitutionalPeriod } from "@/lib/api";
import { DataState, DetailGrid, DetailItem } from "@/components/layout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from "@/components/ui";

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
          <div className="flex flex-col gap-2">
            <Skeleton className="h-6" />
            <Skeleton className="h-6" />
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
          <DetailGrid>
            <DetailItem label="Nombre">{period.name}</DetailItem>
            <DetailItem label="Vigencia">
              {formatDate(period.startDate)} – {formatDate(period.endDate)}
            </DetailItem>
          </DetailGrid>
        )}
      </CardContent>
    </Card>
  );
}
