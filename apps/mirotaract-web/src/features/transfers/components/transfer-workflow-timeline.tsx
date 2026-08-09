"use client";

import type { MembershipTransfer, TransferStatus } from "@/lib/api";
import { usePerson } from "@/lib/api";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@equipoit4845/ui";

import {
  transferStatusToLabel,
  transferStatusToTone,
} from "../adapters/transfer-status-to-tone";
import { formatDateTime } from "../utils/format-date";

type Step = {
  key: string;
  status: TransferStatus;
  label: string;
  at: string;
  performedById?: string | null;
  detail?: string | null;
};

/**
 * Resolves the person who performed a step (`requestedById`/`acceptedById`/
 * `confirmedById`/`rejectedById`/`cancelledById`) — same convention as
 * `MembershipTransition.performedById` in
 * `MembershipHistoryTimeline`, resolved with the public `usePerson` hook,
 * deduplicated by TanStack Query, bounded by the (small, fixed) number of
 * steps a single transfer can have.
 */
function ActorName({ personId }: { personId: string }) {
  const { data: person, isLoading } = usePerson(personId);
  if (isLoading) return <span aria-hidden="true">…</span>;
  if (!person) return <span>—</span>;
  const name =
    person.displayName?.trim() || `${person.firstName} ${person.lastName}`;
  return <span>{name}</span>;
}

/**
 * DOMAIN component — stays in `features/transfers/components`, never moves
 * to the Design System (product spec §12), same criterion as
 * `MembershipHistoryTimeline` (Fase 4). Read-only: renders exactly the
 * `MembershipTransfer` fields the Kernel returned, never fabricates a step
 * that didn't actually happen.
 *
 * `MembershipTransfer` has no `history`/`transitions` array (unlike
 * `Membership`/`MembershipTransition`) — kernel-openapi.yaml only exposes
 * per-step timestamp+actor pairs directly on the resource
 * (`acceptedAt`/`acceptedById`, `confirmedAt`/`confirmedById`, etc). This
 * component reconstructs an ordered step list from whichever of those
 * fields are actually present, sorted ascending by timestamp — it never
 * shows a step whose timestamp field is null (e.g. `CONFIRMED_BY_ORIGIN`
 * never renders on a transfer that's still `REQUESTED`).
 *
 * `EXPIRED` (kernel-spec.md §7.7) has no manual transition and no
 * dedicated `expiredAt` field on `MembershipTransfer` — only `expiresAt`
 * (the deadline, not the event). When `status === "EXPIRED"` this renders
 * one terminal step using `updatedAt` as the closest real timestamp
 * available, labeled the same as everywhere else in the app — it never
 * invents a fake `expiredAt`.
 */
export function TransferWorkflowTimeline({
  transfer,
}: {
  transfer: MembershipTransfer;
}) {
  const steps: Step[] = [
    {
      key: "requested",
      status: "REQUESTED",
      // The step heading is an ACTION phrase, deliberately worded
      // differently from `transferStatusToLabel` (the badge next to it) —
      // otherwise every step would render its own label text twice
      // (heading + badge), same discipline `MembershipHistoryTimeline`
      // keeps by using `membershipTransitionToLabel` (event) vs
      // `membershipStatusToLabel` (resulting status) as two separate
      // vocabularies.
      label: "Transferencia solicitada",
      at: transfer.requestedAt,
      performedById: transfer.requestedById,
      detail: transfer.reason ?? undefined,
    },
  ];

  if (transfer.acceptedAt) {
    steps.push({
      key: "accepted",
      status: "ACCEPTED_BY_DESTINATION",
      label: "El destino aceptó la transferencia",
      at: transfer.acceptedAt,
      performedById: transfer.acceptedById,
    });
  }
  if (transfer.confirmedAt) {
    steps.push({
      key: "confirmed",
      status: "CONFIRMED_BY_ORIGIN",
      label: "El origen confirmó la transferencia",
      at: transfer.confirmedAt,
      performedById: transfer.confirmedById,
    });
  }
  if (transfer.completedAt) {
    steps.push({
      key: "completed",
      status: "COMPLETED",
      label: "Transferencia completada",
      at: transfer.completedAt,
    });
  }
  if (transfer.rejectedAt) {
    steps.push({
      key: "rejected",
      status: "REJECTED",
      label: "Transferencia rechazada",
      at: transfer.rejectedAt,
      performedById: transfer.rejectedById,
      detail: transfer.rejectionReason ?? undefined,
    });
  }
  if (transfer.cancelledAt) {
    steps.push({
      key: "cancelled",
      status: "CANCELLED",
      label: "Transferencia cancelada",
      at: transfer.cancelledAt,
      performedById: transfer.cancelledById,
    });
  }
  if (transfer.status === "EXPIRED") {
    steps.push({
      key: "expired",
      status: "EXPIRED",
      label: "Transferencia expirada",
      at: transfer.updatedAt,
    });
  }

  const ordered = [...steps].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Estado de la transferencia</CardTitle>
      </CardHeader>
      <CardContent>
        <ol
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--mr-space-3)",
            margin: 0,
            padding: 0,
            listStyle: "none",
          }}
        >
          {ordered.map((step) => (
            <li
              key={step.key}
              style={{
                borderLeft: "2px solid var(--mr-color-border)",
                paddingLeft: "var(--mr-space-3)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: "var(--mr-space-2)",
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <strong>{step.label}</strong>
                <Badge tone={transferStatusToTone(step.status)}>
                  {transferStatusToLabel(step.status)}
                </Badge>
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.75rem",
                  color: "var(--mr-color-text-muted)",
                }}
              >
                {formatDateTime(step.at)}
                {step.performedById ? (
                  <>
                    {" · por "}
                    <ActorName personId={step.performedById} />
                  </>
                ) : null}
              </p>
              {step.detail ? <p>{step.detail}</p> : null}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
