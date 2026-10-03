"use client";

import type { DeveloperAppReviewStatus } from "@/lib/api";
import { useReviewQueue } from "@/lib/api";
import { StatusBadge } from "@/components/domain/status-badge";
import { DataState, PageHeader } from "@/components/layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FormField,
  Select,
  Skeleton,
} from "@/components/ui";
import Link from "next/link";
import { useState } from "react";

import { formatDate } from "@/features/developer-apps/utils/app-catalog";
import { useActiveOrganizationContext } from "@/features/shell/active-organization-context";
import { describeKernelError } from "@/features/shell/kernel-error-message";

const FILTERS: Array<{ value: DeveloperAppReviewStatus; label: string }> = [
  { value: "IN_REVIEW", label: "Esperando revisión" },
  { value: "REJECTED", label: "Con cambios pedidos" },
  { value: "APPROVED", label: "Aprobadas" },
];

/**
 * `/developer/reviews` (E11.1) — the RDR's queue: apps of the district and
 * its clubs waiting for the review, oldest first.
 */
export function ReviewQueueContainer() {
  const { organizationId } = useActiveOrganizationContext();
  const [status, setStatus] = useState<DeveloperAppReviewStatus>("IN_REVIEW");
  const queue = useReviewQueue(organizationId, status);

  return (
    <>
      <PageHeader
        title="Revisión de apps"
        description="Antes de que una app use datos personales de los socios, revisás para qué es, qué datos pide, quién responde por ella, su política de privacidad y su contacto."
      />
      <div className="mb-4 max-w-xs">
        <FormField label="Mostrar" htmlFor="review-filter">
          <Select
            id="review-filter"
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as DeveloperAppReviewStatus)
            }
          >
            {FILTERS.map((filter) => (
              <option key={filter.value} value={filter.value}>
                {filter.label}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
      {queue.isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : queue.isError ? (
        <DataState kind="error" {...describeKernelError(queue.error)} />
      ) : !queue.data || queue.data.length === 0 ? (
        <DataState
          kind="empty"
          title={
            status === "IN_REVIEW"
              ? "No hay apps esperando revisión"
              : "No hay apps en este estado"
          }
          description="Cuando un equipo registre una app o pida datos nuevos, aparece acá."
        />
      ) : (
        <ul className="grid gap-3">
          {queue.data.map((item) => (
            <li key={item.appId}>
              <Card>
                <CardHeader>
                  <div className="min-w-0">
                    <CardTitle>
                      <Link
                        href={`/developer/reviews/${item.appId}`}
                        className="hover:underline"
                      >
                        {item.name}
                      </Link>
                    </CardTitle>
                    <CardDescription>
                      De {item.organizationName} · Responsable: {item.ownerName}{" "}
                      · Desde el {formatDate(item.submittedAt)}
                    </CardDescription>
                  </div>
                  <StatusBadge
                    kind="developerAppReview"
                    status={item.reviewStatus}
                  />
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {item.pendingScopes.length > 0
                    ? `Pide ${item.pendingScopes.length} ${item.pendingScopes.length === 1 ? "dato" : "datos"} sin aprobar: ${item.pendingScopes.map((scope) => scope.label.toLowerCase()).join(", ")}.`
                    : "Todo lo que pide está aprobado."}{" "}
                  <Link
                    href={`/developer/reviews/${item.appId}`}
                    className="font-medium text-primary hover:underline"
                  >
                    Revisar
                  </Link>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
