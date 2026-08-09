"use client";

import type { MembershipTransfer } from "@/lib/api";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@equipoit4845/ui";
import Link from "next/link";
import type { ReactNode } from "react";

import {
  transferStatusToLabel,
  transferStatusToTone,
} from "../adapters/transfer-status-to-tone";
import { formatDate } from "../utils/format-date";
import { TransferOrganizationCell } from "./transfer-organization-cell";
import { TransferPersonCell } from "./transfer-person-cell";

function Field({ label, value }: { label: string; value: ReactNode }) {
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
      <dd style={{ margin: 0 }}>{value ?? "—"}</dd>
    </div>
  );
}

/**
 * A single detail page = a single transfer, so resolving its person/two
 * organizations here is three bounded extra requests — not the per-row
 * pattern the list view has to actively guard against (§18/§27). "Persona"
 * and both organizations are links (integration product spec §7/§8),
 * plain `next/link`, never `setActiveOrganizationId` — opening a transfer
 * from another scope never mutates the Shell's active organization.
 */
export function TransferSummaryCard({
  transfer,
}: {
  transfer: MembershipTransfer;
}) {
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
          <Field
            label="Persona"
            value={<TransferPersonCell membershipId={transfer.membershipId} />}
          />
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
              <Badge tone={transferStatusToTone(transfer.status)}>
                {transferStatusToLabel(transfer.status)}
              </Badge>
            </dd>
          </div>
          <Field
            label="Organización origen"
            value={
              <TransferOrganizationCell
                organizationId={transfer.fromOrganizationId}
                linkToProfile
              />
            }
          />
          <Field
            label="Organización destino"
            value={
              <TransferOrganizationCell
                organizationId={transfer.toOrganizationId}
                linkToProfile
              />
            }
          />
          <Field
            label="Fecha de solicitud"
            value={formatDate(transfer.requestedAt)}
          />
          <Field label="Motivo" value={transfer.reason ?? undefined} />
          {transfer.destinationMembershipId ? (
            <Field
              label="Membresía destino"
              value={
                <Link href={`/memberships/${transfer.destinationMembershipId}`}>
                  Ver membresía
                </Link>
              }
            />
          ) : null}
        </dl>
      </CardContent>
    </Card>
  );
}
