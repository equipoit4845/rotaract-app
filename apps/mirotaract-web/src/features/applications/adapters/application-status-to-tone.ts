import type { ApplicationStatus } from "@/lib/api";
import type { MrStateTone } from "@equipoit4845/design-tokens";

/**
 * `ApplicationStatus` never leaves this feature as-is — only tone/label
 * reach the Design System (same rule as
 * `features/memberships/adapters/membership-status-to-tone.ts`). Local to
 * Applications on purpose (product spec §32 — Fase 7/8 both active at
 * once): if this changes, there is no equivalent status in Memberships or
 * Transfers to keep in sync with.
 */
const LABEL: Record<ApplicationStatus, string> = {
  DRAFT: "Borrador",
  SUBMITTED: "Enviada",
  APPROVED: "Aprobada",
  REJECTED: "Rechazada",
  CANCELLED: "Cancelada",
  EXPIRED: "Expirada",
};

export function applicationStatusToTone(
  status: ApplicationStatus,
): MrStateTone {
  switch (status) {
    case "DRAFT":
      return "neutral";
    case "SUBMITTED":
      return "info";
    case "APPROVED":
      return "success";
    case "REJECTED":
      return "danger";
    case "CANCELLED":
      return "neutral";
    case "EXPIRED":
      return "warning";
  }
}

export function applicationStatusToLabel(status: ApplicationStatus): string {
  return LABEL[status];
}
