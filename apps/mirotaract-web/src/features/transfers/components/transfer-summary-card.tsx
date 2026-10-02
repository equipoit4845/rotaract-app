"use client";

import type { MembershipTransfer } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import Link from "next/link";
import type { ReactNode } from "react";

import { formatDate } from "../utils/format-date";
import { TransferOrganizationCell } from "./transfer-organization-cell";
import { TransferPersonCell } from "./transfer-person-cell";
import { DetailGrid, DetailItem } from "@/components/layout";

function Field({ label, value }: { label: string; value: ReactNode }) {
  return <DetailItem label={label}>{value ?? "—"}</DetailItem>;
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
        <DetailGrid>
          <Field
            label="Persona"
            value={<TransferPersonCell membershipId={transfer.membershipId} />}
          />
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
        </DetailGrid>
      </CardContent>
    </Card>
  );
}
