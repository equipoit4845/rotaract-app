import type { AppointmentStatus } from "@/lib/api";
import type { MrStateTone } from "@equipoit4845/design-tokens";

/**
 * Local to Appointments, deliberately not imported from
 * `features/dashboard/adapters/appointment-status-to-tone.ts` (every phase
 * keeps its own minimal copy off the public `AppointmentStatus` enum
 * instead of importing another feature's folder — same convention as
 * `organizationStatusToTone`).
 */
const LABEL: Record<AppointmentStatus, string> = {
  NOMINATED: "Nominado",
  ELECTED: "Electo",
  ACTIVE: "Activo",
  ENDED: "Finalizado",
  REVOKED: "Revocado",
};

export function appointmentStatusToTone(
  status: AppointmentStatus,
): MrStateTone {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "ELECTED":
      return "warning";
    case "NOMINATED":
      return "neutral";
    case "ENDED":
      return "neutral";
    case "REVOKED":
      return "danger";
  }
}

export function appointmentStatusToLabel(status: AppointmentStatus): string {
  return LABEL[status];
}
