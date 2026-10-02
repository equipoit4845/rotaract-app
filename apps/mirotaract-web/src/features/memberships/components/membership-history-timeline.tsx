"use client";

import type { MembershipTransition } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

import { membershipTransitionToLabel } from "../adapters/membership-transition-to-label";
import { formatDateTime } from "../utils/format-date";
import { MembershipPersonCell } from "./membership-person-cell";
import { StatusBadge } from "@/components/domain/status-badge";

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
        <ol className="flex flex-col gap-3 m-0 p-0 list-none">
          {ordered.map((transition) => (
            <li key={transition.id} className="border-l-2 border-border pl-3">
              <div className="flex gap-2 items-center flex-wrap">
                <strong>{membershipTransitionToLabel(transition.type)}</strong>
                <StatusBadge kind="membership" status={transition.toStatus} />
              </div>
              <p className="m-0 text-xs text-muted-foreground">
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
