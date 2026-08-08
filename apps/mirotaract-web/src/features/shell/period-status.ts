import type { PeriodStatus } from "@/lib/api";
import type { PeriodIndicatorStatus } from "@equipoit4845/admin-shell";

/**
 * Kernel → visual mapping. `PeriodIndicator` only ever sees this tri-state,
 * never a Kernel `PeriodStatus` — the mapping itself lives in the Web
 * Shell, not in @equipoit4845/admin-shell (see docs/08-design-system.md).
 */
export function toVisualPeriodStatus(
  status: PeriodStatus,
): PeriodIndicatorStatus {
  switch (status) {
    case "ACTIVE":
      return "active";
    case "DRAFT":
    case "SCHEDULED":
      return "pending";
    case "CLOSED":
    case "CANCELLED":
      return "inactive";
  }
}
