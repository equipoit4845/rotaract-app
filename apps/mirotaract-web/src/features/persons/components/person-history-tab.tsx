"use client";

import type { Person } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@equipoit4845/ui";

import { toPersonIdentityViewModel } from "../view-models/person-identity";
import { FieldRow } from "./field-row";

/**
 * There's no Person audit-history endpoint in the contract (unlike
 * Membership, which has `GET /memberships/{id}/history`) — this is
 * deliberately scoped to the lifecycle timestamps the `Person` DTO
 * already carries, not a fabricated audit log.
 */
export function PersonHistoryTab({ person }: { person: Person }) {
  const identity = toPersonIdentityViewModel(person);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Historial</CardTitle>
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
          {identity.lifecycle.map((field) => (
            <FieldRow key={field.label} {...field} />
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
