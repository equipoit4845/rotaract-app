"use client";

import type { Appointment } from "@/lib/api";

import { ActivateAppointmentDialog } from "../forms/activate-appointment-dialog";
import { EndAppointmentDialog } from "../forms/end-appointment-dialog";
import { MarkElectedDialog } from "../forms/mark-elected-dialog";
import { RevokeAppointmentDialog } from "../forms/revoke-appointment-dialog";

/**
 * Each action gates itself on `useCan()` + the real state machine (§7.5)
 * and renders nothing when not applicable — this row never hardcodes which
 * actions exist, same convention as `OrganizationActionsRow`.
 */
export function AppointmentActionsRow({
  appointment,
}: {
  appointment: Appointment;
}) {
  return (
    <div
      style={{ display: "flex", gap: "var(--mr-space-2)", flexWrap: "wrap" }}
    >
      <MarkElectedDialog appointment={appointment} />
      <ActivateAppointmentDialog appointment={appointment} />
      <EndAppointmentDialog appointment={appointment} />
      <RevokeAppointmentDialog appointment={appointment} />
    </div>
  );
}
