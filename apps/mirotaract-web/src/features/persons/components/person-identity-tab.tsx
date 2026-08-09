"use client";

import type { Person } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@equipoit4845/ui";

import { toPersonIdentityViewModel } from "../view-models/person-identity";
import { FieldRow } from "./field-row";

const GRID_STYLE = {
  display: "grid",
  gap: "var(--mr-space-4)",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  margin: 0,
} as const;

/**
 * Two cards, not a flat field list — "basic" (name) vs "sensitive"
 * (email/phone/birth date) is a presentational grouping only; the Kernel
 * already decided whether this response is authorized at all
 * (`kernel.person.read`/`.self`), see docs/09-administrative-web.md.
 */
export function PersonIdentityTab({ person }: { person: Person }) {
  const identity = toPersonIdentityViewModel(person);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--mr-space-4)",
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>Identidad</CardTitle>
        </CardHeader>
        <CardContent>
          <dl style={GRID_STYLE}>
            {identity.basic.map((field) => (
              <FieldRow key={field.label} {...field} />
            ))}
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Datos sensibles</CardTitle>
        </CardHeader>
        <CardContent>
          <dl style={GRID_STYLE}>
            {identity.sensitive.map((field) => (
              <FieldRow key={field.label} {...field} />
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
