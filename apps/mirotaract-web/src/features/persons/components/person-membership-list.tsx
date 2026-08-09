"use client";

import { usePersonMemberships } from "@/lib/api";
import { DataState } from "@equipoit4845/admin-shell";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@equipoit4845/ui";

import { describeKernelError } from "@/features/shell/kernel-error-message";

import { PersonMembershipRow } from "./person-membership-row";

/**
 * Read-only: this feature never mutates a `Membership` (product spec
 * §11/§29 for this phase) — no activate/deactivate/graduate action lives
 * here, only the same read hook (`usePersonMemberships`, public via
 * `@/lib/api`) that a Memberships-feature screen would also use.
 */
export function PersonMembershipList({ personId }: { personId: string }) {
  const membershipsQuery = usePersonMemberships(personId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Membresías</CardTitle>
      </CardHeader>
      <CardContent>
        {membershipsQuery.isLoading ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--mr-space-2)",
            }}
          >
            <Skeleton style={{ height: "1.5rem" }} />
            <Skeleton style={{ height: "1.5rem" }} />
          </div>
        ) : membershipsQuery.isError ? (
          <DataState
            kind="error"
            {...describeKernelError(membershipsQuery.error)}
          />
        ) : !membershipsQuery.data || membershipsQuery.data.length === 0 ? (
          <DataState
            kind="empty"
            title="Sin membresías"
            description="Esta persona todavía no tiene membresías registradas."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organización</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Inicio</TableHead>
                <TableHead>Fin</TableHead>
                <TableHead>Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {membershipsQuery.data.map((membership) => (
                <PersonMembershipRow
                  key={membership.id}
                  membership={membership}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
