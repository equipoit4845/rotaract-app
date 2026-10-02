"use client";

import type { Organization } from "@/lib/api";
import { DataState } from "@/components/layout";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";

import { describeKernelError } from "@/features/shell/kernel-error-message";
import { StatusBadge } from "@/components/domain/status-badge";

/**
 * One request (`useOrganizationChildren`), rendered as-is — no per-club
 * follow-up request for member/appointment counts. That's exactly the
 * "list clubs → GET members per club" pattern the product spec forbids
 * (§18); a district's clubs table only ever shows what
 * `GET /organizations/{id}/children` already returns.
 */
export function ChildOrganizationsCard({
  organizations,
  isLoading,
  isError,
  error,
}: {
  organizations: Organization[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Clubes</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--mr-space-2)",
            }}
          >
            <Skeleton style={{ height: "1.5rem" }} />
            <Skeleton style={{ height: "1.5rem" }} />
            <Skeleton style={{ height: "1.5rem" }} />
          </div>
        ) : isError ? (
          <DataState kind="error" {...describeKernelError(error)} />
        ) : !organizations || organizations.length === 0 ? (
          <DataState
            kind="empty"
            title="Sin clubes"
            description="Este distrito todavía no tiene clubes registrados."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {organizations.map((org) => (
                <TableRow key={org.id}>
                  <TableCell>
                    <Link href={`/organizations/${org.id}`}>{org.name}</Link>
                  </TableCell>
                  <TableCell>{org.code}</TableCell>
                  <TableCell>
                    <StatusBadge kind="organization" status={org.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
