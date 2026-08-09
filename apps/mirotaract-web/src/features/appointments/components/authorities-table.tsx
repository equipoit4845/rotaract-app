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

/**
 * US-APP-01 — `Appointment` is the only source of authority truth (never
 * `Membership.title`, never `isPresident`). `positionsById` comes from a
 * single bounded catalog fetch (`usePositionDefinitions()`), not a per-row
 * request — same shape as Dashboard's `AuthoritiesCard`.
 */
export function AuthoritiesTable({
  appointments,
  positionsById,
}: {
  appointments: Appointment[];
  positionsById: Map<string, PositionDefinition>;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Cargo</TableHead>
          <TableHead>Persona</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Acción</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {appointments.map((appointment) => (
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
