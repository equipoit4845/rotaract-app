"use client";

import type { Appointment, PositionDefinition } from "@/lib/api";
import { DataState } from "@/components/layout";
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
} from "@/components/ui";

import { describeKernelError } from "@/features/shell/kernel-error-message";

import { AuthorityRow } from "./authority-row";

export function AuthoritiesCard({
  title,
  emptyDescription,
  appointments,
  positionsById,
  isLoading,
  isError,
  error,
}: {
  title: string;
  emptyDescription: string;
  appointments: Appointment[] | undefined;
  positionsById: Map<string, PositionDefinition>;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-6" />
            <Skeleton className="h-6" />
            <Skeleton className="h-6" />
          </div>
        ) : isError ? (
          <DataState kind="error" {...describeKernelError(error)} />
        ) : !appointments || appointments.length === 0 ? (
          <DataState
            kind="empty"
            title="Sin autoridades vigentes"
            description={emptyDescription}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cargo</TableHead>
                <TableHead>Persona</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {appointments.map((appointment) => (
                <AuthorityRow
                  key={appointment.id}
                  appointment={appointment}
                  positionName={
                    positionsById.get(appointment.positionDefinitionId)?.name ??
                    "Cargo"
                  }
                />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
