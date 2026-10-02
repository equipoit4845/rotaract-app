"use client";

import type { Person } from "@/lib/api";
import { DetailGrid } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

import { toPersonIdentityViewModel } from "../view-models/person-identity";
import { FieldRow } from "./field-row";

/**
 * Two cards, not a flat field list — "basic" (name) vs "sensitive"
 * (email/phone/birth date) is a presentational grouping only; the Kernel
 * already decided whether this response is authorized at all
 * (`kernel.person.read`/`.self`), see docs/09-administrative-web.md.
 */
export function PersonIdentityTab({ person }: { person: Person }) {
  const identity = toPersonIdentityViewModel(person);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Identidad</CardTitle>
        </CardHeader>
        <CardContent>
          <DetailGrid>
            {identity.basic.map((field) => (
              <FieldRow key={field.label} {...field} />
            ))}
          </DetailGrid>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Datos sensibles</CardTitle>
        </CardHeader>
        <CardContent>
          <DetailGrid>
            {identity.sensitive.map((field) => (
              <FieldRow key={field.label} {...field} />
            ))}
          </DetailGrid>
        </CardContent>
      </Card>
    </div>
  );
}
