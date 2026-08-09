import type { MembershipStatus } from "@/lib/api";
import type { MrStateTone } from "@equipoit4845/design-tokens";

/**
 * Concuerda en género con "la membresía", no con "el socio" — y coincide a
 * propósito con el label usado por `features/persons/adapters/
 * membership-status-to-tone.ts` (tab "Membresías" de Person detail, sólo
 * lectura). Son dos archivos separados a propósito (evitar acoplar ambas
 * features — product spec §11/§24), pero el mismo `MembershipStatus` debe
 * verse igual en cualquier pantalla: mismo texto, mismo tono. Si se cambia
 * acá, cambiar también el de Persons.
 */
const LABEL: Record<MembershipStatus, string> = {
  PENDING: "Pendiente",
  ACTIVE: "Activa",
  ON_LEAVE: "En licencia",
  INACTIVE: "Inactiva",
  GRADUATED: "Graduada",
  TRANSFERRED: "Transferida",
};

/** `MembershipStatus` never leaves this feature as-is — only tone/label reach the Design System (product spec §9). */
export function membershipStatusToTone(status: MembershipStatus): MrStateTone {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "ON_LEAVE":
      return "warning";
    case "INACTIVE":
      return "warning";
    case "PENDING":
      return "neutral";
    case "GRADUATED":
      return "info";
    case "TRANSFERRED":
      return "neutral";
  }
}

export function membershipStatusToLabel(status: MembershipStatus): string {
  return LABEL[status];
}
