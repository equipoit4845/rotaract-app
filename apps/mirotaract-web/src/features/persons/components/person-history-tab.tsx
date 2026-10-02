"use client";

import type { Person } from "@/lib/api";
import { DetailGrid } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

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
        <DetailGrid>
          {identity.lifecycle.map((field) => (
            <FieldRow key={field.label} {...field} />
          ))}
        </DetailGrid>
      </CardContent>
    </Card>
  );
}
