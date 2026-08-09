"use client";

import type { Organization } from "@/lib/api";
import { useOrganizationChildren } from "@/lib/api";
import { DataState } from "@equipoit4845/admin-shell";
import {
  Badge,
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
} from "@equipoit4845/ui";
import Link from "next/link";

import { describeKernelError } from "@/features/shell/kernel-error-message";

import {
  organizationStatusToLabel,
  organizationStatusToTone,
} from "../adapters/organization-status-to-tone";

/**
 * `ancestors` is passed in from the container, which already fetches it
 * for the page's Breadcrumb — this tab reuses that same data instead of
 * re-requesting it. `children` is fetched here, so it only fires while
 * this tab is actually mounted (Radix `Tabs.Content` unmounts inactive
 * panels by default — product spec §21 "cada tab consulta sólo cuando
 * está activo"). `descendants` isn't wired to any UI in this phase: a
 * two-level view (ancestors + direct children) already covers "entender
 * District → Clubs" (§13), and adding it would be an unused request.
 */
export function OrganizationHierarchyTab({
  organization,
  ancestors,
}: {
  organization: Organization;
  ancestors: Organization[];
}) {
  const childrenQuery = useOrganizationChildren(organization.id);

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
          <CardTitle>Ancestros</CardTitle>
        </CardHeader>
        <CardContent>
          {ancestors.length === 0 ? (
            <p style={{ margin: 0 }}>
              Esta organización no tiene ancestros — es una raíz de la
              jerarquía.
            </p>
          ) : (
            <ol style={{ margin: 0, paddingLeft: "1.25rem" }}>
              {ancestors.map((ancestor) => (
                <li key={ancestor.id}>
                  <Link href={`/organizations/${ancestor.id}`}>
                    {ancestor.name}
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hijos directos</CardTitle>
        </CardHeader>
        <CardContent>
          {childrenQuery.isLoading ? (
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
          ) : childrenQuery.isError ? (
            <DataState
              kind="error"
              {...describeKernelError(childrenQuery.error)}
            />
          ) : !childrenQuery.data || childrenQuery.data.length === 0 ? (
            <DataState
              kind="empty"
              title="Sin organizaciones hijas"
              description="Esta organización todavía no tiene hijos directos registrados."
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
                {childrenQuery.data.map((child) => (
                  <TableRow key={child.id}>
                    <TableCell>
                      <Link href={`/organizations/${child.id}`}>
                        {child.name}
                      </Link>
                    </TableCell>
                    <TableCell>{child.code}</TableCell>
                    <TableCell>
                      <Badge tone={organizationStatusToTone(child.status)}>
                        {organizationStatusToLabel(child.status)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
