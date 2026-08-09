import type { MembershipTransition } from "@/lib/api";

const LABEL: Record<MembershipTransition["type"], string> = {
  CREATED: "Membresía creada",
  ACTIVATED: "Activada",
  LEAVE_STARTED: "Puesta en licencia",
  LEAVE_ENDED: "Licencia finalizada",
  DEACTIVATED: "Desactivada",
  GRADUATED: "Egreso registrado",
  TRANSFERRED_OUT: "Transferida (salida)",
  TRANSFERRED_IN: "Transferida (entrada)",
  REACTIVATED: "Reactivada",
};

export function membershipTransitionToLabel(
  type: MembershipTransition["type"],
): string {
  return LABEL[type];
}
