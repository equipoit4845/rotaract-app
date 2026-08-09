"use client";

import type { OrganizationMembership } from "@/lib/api";
import { useOrganization } from "@/lib/api";
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
  membershipStatusToLabel,
  membershipStatusToTone,
} from "../adapters/membership-status-to-tone";
import { formatDate } from "../utils/format-date";
import { MembershipPersonCell } from "./membership-person-cell";

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
 * A single detail page = a single membership, so resolving its one
 * person/organization here is two bounded extra requests — not the
 * per-row pattern the list view has to actively guard against (§18/§27).
 * No "tipo" field: `OrganizationMembership` has none (kernel-openapi.yaml
 * — see docs/09, US-MEM-01).
 *
 * "Persona" and "Organización" are both links (integration product spec
 * §7/§8): Membership → Person, Membership → Organization. Neither touches
 * `activeOrganizationId` — this is a plain `next/link`, not
 * `setActiveOrganizationId`, so opening a membership from another scope
 * never mutates the Shell's active organization. Persona only ever shows
 * a name (no email/phone) — no fuller profile is duplicated here (§7's
 * "no duplicar un perfil completo de Person dentro de Membership").
 */
export function MembershipSummaryCard({
  membership,
}: {
  membership: OrganizationMembership;
}) {
  const { data: organization } = useOrganization(membership.organizationId);

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
            value={
              <MembershipPersonCell
                personId={membership.personId}
                linkToProfile
              />
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
              <Badge tone={membershipStatusToTone(membership.status)}>
                {membershipStatusToLabel(membership.status)}
              </Badge>
            </dd>
          </div>
          <Field label="Número de socio" value={membership.memberNumber} />
          <Field
            label="Fecha de ingreso"
            value={
              membership.joinedAt ? formatDate(membership.joinedAt) : undefined
            }
          />
          <Field
            label="Fecha de fin"
            value={
              membership.endedAt ? formatDate(membership.endedAt) : undefined
            }
          />
          <Field
            label="Último cambio de estado"
            value={
              membership.statusChangedAt
                ? formatDate(membership.statusChangedAt)
                : undefined
            }
          />
        </dl>
      </CardContent>
    </Card>
  );
}
