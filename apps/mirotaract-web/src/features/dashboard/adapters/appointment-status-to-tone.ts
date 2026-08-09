import type { AppointmentStatus } from "@/lib/api";
import type { MrStateTone } from "@equipoit4845/design-tokens";

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
