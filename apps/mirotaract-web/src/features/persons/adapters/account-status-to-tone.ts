import type { UserAccount } from "@/lib/api";
import type { MrStateTone } from "@equipoit4845/design-tokens";

/**
 * `AccountStatus` isn't exported as a standalone type from `@/lib/api` (only
 * `UserAccount` is) — derived via indexed access instead of reaching into
 * `client/schema.ts` directly, which the feature boundary forbids.
 */
type AccountStatus = UserAccount["status"];

const LABEL: Record<AccountStatus, string> = {
  PENDING_VERIFICATION: "Verificación pendiente",
  ACTIVE: "Activa",
  SUSPENDED: "Suspendida",
  DISABLED: "Deshabilitada",
};

export function accountStatusToTone(status: AccountStatus): MrStateTone {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "PENDING_VERIFICATION":
      return "warning";
    case "SUSPENDED":
      return "danger";
    case "DISABLED":
      return "neutral";
  }
}

export function accountStatusToLabel(status: AccountStatus): string {
  return LABEL[status];
}
