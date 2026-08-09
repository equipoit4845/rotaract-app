"use client";

import type { MembershipTransition } from "@/lib/api";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@equipoit4845/ui";

import {
  membershipStatusToLabel,
  membershipStatusToTone,
} from "../adapters/membership-status-to-tone";
import { membershipTransitionToLabel } from "../adapters/membership-transition-to-label";
import { formatDateTime } from "../utils/format-date";
import { MembershipPersonCell } from "./membership-person-cell";

/**
 * DOMAIN component — stays in `features/memberships/components`, never
 * moves to the Design System (product spec §12). Read-only: renders
 * exactly the `MembershipTransition[]` the Kernel returned, never
 * reconstructs history from the current status, never deletes an entry
 * (invariant 6.4.5 — a membership is never physically deleted, its
 * history is permanent).
 *
 * `effectiveAt` isn't documented as ordered by `kernel-openapi.yaml`
 * (`getMembershipHistory` just returns `MembershipTransition[]`), so this
 * sorts ascending locally — an allowed presentation-only reordering of
 * real data, never a fabricated entry (product spec §11).
 */
export function MembershipHistoryTimeline({
  transitions,
}: {
  transitions: MembershipTransition[];
}) {
  if (transitions.length === 0) {
    return <p>Sin historial todavía.</p>;
  }

  const ordered = [...transitions].sort(
    (a, b) =>
      new Date(a.effectiveAt).getTime() - new Date(b.effectiveAt).getTime(),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Historial</CardTitle>
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
          {ordered.map((transition) => (
            <li
              key={transition.id}
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
                <strong>{membershipTransitionToLabel(transition.type)}</strong>
                <Badge tone={membershipStatusToTone(transition.toStatus)}>
                  {membershipStatusToLabel(transition.toStatus)}
                </Badge>
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.75rem",
                  color: "var(--mr-color-text-muted)",
                }}
              >
                {formatDateTime(transition.effectiveAt)}
                {transition.performedById ? (
                  <>
                    {" · por "}
                    <MembershipPersonCell personId={transition.performedById} />
                  </>
                ) : null}
              </p>
              {transition.reasonText ? <p>{transition.reasonText}</p> : null}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
