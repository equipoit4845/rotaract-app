"use client";

import type { Appointment, PositionDefinition } from "@/lib/api";
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@equipoit4845/ui";
import Link from "next/link";

import {
  appointmentStatusToLabel,
  appointmentStatusToTone,
} from "../adapters/appointment-status-to-tone";
import { AppointmentMembershipCell } from "./appointment-membership-cell";
import { AppointmentPeriodCell } from "./appointment-period-cell";

export function AppointmentsTable({
  items,
  positionsById,
}: {
  items: Appointment[];
  positionsById: Map<string, PositionDefinition>;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Cargo</TableHead>
          <TableHead>Persona</TableHead>
          <TableHead>Período</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Acción</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((appointment) => (
          <TableRow key={appointment.id}>
            <TableCell>
              {positionsById.get(appointment.positionDefinitionId)?.name ??
                "Cargo"}
            </TableCell>
            <TableCell>
              <AppointmentMembershipCell
                membershipId={appointment.membershipId}
              />
            </TableCell>
            <TableCell>
              <AppointmentPeriodCell periodId={appointment.periodId} />
            </TableCell>
            <TableCell>
              <Badge tone={appointmentStatusToTone(appointment.status)}>
                {appointmentStatusToLabel(appointment.status)}
              </Badge>
            </TableCell>
            <TableCell>
              <Link href={`/appointments/${appointment.id}`}>Ver detalle</Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
