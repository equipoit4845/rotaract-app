import type { AccountInvitation } from "@/lib/api";
import type { MrStateTone } from "@equipoit4845/design-tokens";

/** `InvitationStatus` isn't exported standalone — derived from `AccountInvitation`, same reasoning as `AccountStatus`. */
type InvitationStatus = AccountInvitation["status"];

const LABEL: Record<InvitationStatus, string> = {
  PENDING: "Pendiente",
  ACCEPTED: "Aceptada",
  EXPIRED: "Vencida",
  REVOKED: "Revocada",
};

export function invitationStatusToTone(status: InvitationStatus): MrStateTone {
  switch (status) {
    case "PENDING":
      return "info";
    case "ACCEPTED":
      return "success";
    case "EXPIRED":
      return "neutral";
    case "REVOKED":
      return "danger";
  }
}

export function invitationStatusToLabel(status: InvitationStatus): string {
  return LABEL[status];
}
