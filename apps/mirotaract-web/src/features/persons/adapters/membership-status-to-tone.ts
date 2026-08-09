import type { MembershipStatus } from "@/lib/api";
import type { MrStateTone } from "@equipoit4845/design-tokens";

/**
 * Local to Persons, deliberately not shared with `features/memberships`
 * (product spec §11/§24 — avoid coupling the two features with a
 * cross-feature domain import). This feature only ever reads membership
 * status for read-only display (`PersonMembershipList`), never mutates it.
 *
 * Tone and label are kept identical on purpose to
 * `features/memberships/adapters/membership-status-to-tone.ts` — the same
 * `MembershipStatus` must render the same color/text whether it's seen
 * from a Person's "Membresías" tab or from Memberships itself. If this
 * mapping changes, change the other file too.
 */
const LABEL: Record<MembershipStatus, string> = {
  PENDING: "Pendiente",
  ACTIVE: "Activa",
  ON_LEAVE: "En licencia",
  INACTIVE: "Inactiva",
  GRADUATED: "Graduada",
  TRANSFERRED: "Transferida",
};

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
