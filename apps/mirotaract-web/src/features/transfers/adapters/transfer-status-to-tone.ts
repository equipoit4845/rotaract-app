import type { TransferStatus } from "@/lib/api";
import type { MrStateTone } from "@equipoit4845/design-tokens";

/**
 * `TransferStatus` never leaves this feature as-is — only tone/label reach
 * the Design System, same discipline as
 * `features/memberships/adapters/membership-status-to-tone.ts` (product
 * spec §9). This is a separate, local mapping on purpose (product spec §32
 * — Membresías and Transferencias are independent tracks); it's fine for
 * the label wording to differ, `TransferStatus` and `MembershipStatus` are
 * different enums with no shared meaning to keep in sync.
 */
const LABEL: Record<TransferStatus, string> = {
  REQUESTED: "Solicitada",
  ACCEPTED_BY_DESTINATION: "Aceptada por destino",
  CONFIRMED_BY_ORIGIN: "Confirmada por origen",
  COMPLETED: "Completada",
  REJECTED: "Rechazada",
  CANCELLED: "Cancelada",
  EXPIRED: "Expirada",
};

export function transferStatusToTone(status: TransferStatus): MrStateTone {
  switch (status) {
    case "COMPLETED":
      return "success";
    case "REQUESTED":
    case "ACCEPTED_BY_DESTINATION":
    case "CONFIRMED_BY_ORIGIN":
      return "info";
    case "REJECTED":
    case "CANCELLED":
    case "EXPIRED":
      return "neutral";
  }
}

export function transferStatusToLabel(status: TransferStatus): string {
  return LABEL[status];
}
